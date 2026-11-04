#!/usr/bin/env node
// plan: turns a target into a review packet on disk, so the orchestrator never handles a diff.
//
// Target (one of): --range a..b | --staged | --unstaged | --uncommitted | --diff-file <path> |
// --snapshot. Narrowing: --paths a,b --exclude x,y. Shape: --tier small|medium|large
// --quality merged|split --passes n --effort level --extra a,b --skip a,b --seed n.
// --out <dir> is the packet folder (required, and never inside the reviewed repo).
//
// stdout: a summary with the tier, the preview and one line per spawn; plan.json in the packet has
// everything. Layout and shapes are in references/formats.md.
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { CHUNK_BYTES, PART_BYTES, chunksForPass, parts, relativeImports } from './lib/chunk.mjs';
import { addedText, isMechanical, mechanicalSummary, parseUnifiedDiff, renderDiff, renderSnapshot, splitRendered } from './lib/diff.mjs';
import { normalizePath, secretPattern, splitCsv } from './lib/files.mjs';
import { args, emit, fail } from './lib/cli.mjs';
import { listModules } from './lib/modules.mjs';
import { git, repoRoot } from './lib/repo.mjs';
import { freshSeed, parseSeed } from './lib/seed.mjs';
import { TIERS, budgetFor, decideReviewers, estimateTokens, isLogic, personasFor, selectFiles, tierFor } from './lib/select.mjs';

const NAME = 'plan';
const DIFF = ['-c', 'core.quotePath=false', 'diff', '--no-color', '--no-ext-diff', '-M', '--src-prefix=a/', '--dst-prefix=b/'];
const MAX_IMPORT_SCAN_BYTES = 2_000_000;

function readDiff(root, values) {
  if (values['diff-file']) return readFileSync(values['diff-file'], 'utf8');
  if (values.staged) return git(root, ...DIFF, '--cached');
  if (values.unstaged) return git(root, ...DIFF);
  if (values.range) {
    const [from, to] = values.range.split('..');
    if (!from || !to) fail(NAME, '--range needs <from>..<to>');
    return git(root, ...DIFF, from, to);
  }
  return git(root, 'rev-parse', '--verify', '-q', 'HEAD') === null ? git(root, ...DIFF, '--cached') : git(root, ...DIFF, 'HEAD');
}

function untrackedFiles(root) {
  const listed = git(root, 'ls-files', '-o', '--exclude-standard', '-z') ?? '';
  return listed.split('\0').filter(Boolean).map((path) => {
    const base = { path, oldPath: null, status: 'A', similarity: null, binary: false, insertions: 0, deletions: 0, hunks: [] };
    // Never opened: only its name reaches the report.
    if (secretPattern(path)) return base;
    const buf = readFileSync(join(root, path));
    if (buf.includes(0)) return { ...base, binary: true, insertions: null };
    const lines = buf.toString('utf8').split(/\r?\n/);
    if (lines.at(-1) === '') lines.pop();
    return { ...base, insertions: lines.length, hunks: lines.length ? [{ oldStart: 0, newStart: 1, context: '', lines: lines.map((l) => `+${l}`) }] : [] };
  });
}

function fileImports(root, path, status) {
  if (status === 'D') return [];
  try {
    const full = join(root, path);
    if (statSync(full).size > MAX_IMPORT_SCAN_BYTES) return [];
    return relativeImports(path, readFileSync(full, 'utf8'));
  } catch {
    return [];
  }
}

function fromDiff(root, values, paths, exclude) {
  const text = readDiff(root, values);
  if (text === null) fail(NAME, 'git diff failed; check the target');
  const files = parseUnifiedDiff(text);
  if (values.uncommitted) files.push(...untrackedFiles(root));
  const byPath = new Map(files.map((f) => [normalizePath(f.path), f]));
  const records = files.map((f) => ({ path: f.path, status: f.status, insertions: f.insertions, deletions: f.deletions, bytes: Buffer.byteLength(renderDiff(f)), diff: addedText(f) }));
  const selection = selectFiles(records, { paths, exclude, maxBytes: Number.MAX_SAFE_INTEGER });
  const mechanical = [];
  const units = [];
  for (const entry of selection.reviewable) {
    const file = byPath.get(entry.path);
    if (isMechanical(file)) mechanical.push(file);
    else units.push({ ...entry, weight: (file.insertions ?? 0) + (file.deletions ?? 0), rendered: renderDiff(file), imports: fileImports(root, entry.path, file.status) });
  }
  return { units, mechanical, excluded: selection.excluded, secrets: selection.secrets, mode: 'diff' };
}

function fromSnapshot(root, paths, exclude) {
  const { modules, excluded } = listModules(root, { paths, exclude });
  const secrets = excluded.filter((e) => e.reason === 'secret').map((e) => e.path);
  const units = modules.flatMap((m) => m.files).map((f) => {
    const text = readFileSync(join(root, f.path), 'utf8');
    const rendered = renderSnapshot(f.path, text);
    return { ...f, weight: rendered.split('\n').length - 2, rendered, imports: relativeImports(f.path, text) };
  });
  return { units, mechanical: [], excluded: excluded.filter((e) => e.reason !== 'secret'), secrets, mode: 'snapshot', modules: modules.length };
}

const safeName = (path) => path.replace(/[\\/]/g, '__').replace(/[^\w.@-]/g, '_');

function expandUnits(units) {
  return units.flatMap((u) => splitRendered(u.rendered, CHUNK_BYTES).map((rendered) => ({ ...u, rendered, bytes: Buffer.byteLength(rendered) })));
}

function spawnPrompt({ mode, reviewer, pass, budget, chunk, of, files, partPaths, mechanicalPath }) {
  const out = [
    `<mode>${mode}</mode>`,
    `<reviewer>${reviewer}</reviewer>`,
    `<pass>${pass}</pass>`,
    `<budget>${budget}</budget>`,
    of > 1 ? `<chunk>${chunk} of ${of}: review only these files</chunk>` : null,
    '<assigned_files>',
    ...files,
    '</assigned_files>',
    '<parts>',
    ...partPaths,
    '</parts>',
    mechanicalPath ? `<mechanical>${mechanicalPath}</mechanical>` : null,
  ];
  return `${out.filter(Boolean).join('\n')}\n`;
}

function main() {
  const { values } = args(NAME, {
    repo: { type: 'string', default: '.' },
    out: { type: 'string' },
    range: { type: 'string' },
    staged: { type: 'boolean', default: false },
    unstaged: { type: 'boolean', default: false },
    uncommitted: { type: 'boolean', default: false },
    snapshot: { type: 'boolean', default: false },
    'diff-file': { type: 'string' },
    paths: { type: 'string', default: '' },
    exclude: { type: 'string', default: '' },
    tier: { type: 'string' },
    quality: { type: 'string', default: 'merged' },
    passes: { type: 'string' },
    effort: { type: 'string' },
    extra: { type: 'string', default: '' },
    skip: { type: 'string', default: '' },
    seed: { type: 'string' },
  });
  if (!values.out) fail(NAME, '--out <dir> is required');
  const targets = ['range', 'staged', 'unstaged', 'uncommitted', 'snapshot', 'diff-file'].filter((k) => values[k]);
  if (targets.length !== 1) fail(NAME, `pass exactly one target; got ${targets.length}`);
  if (values.tier && !TIERS.includes(values.tier)) fail(NAME, `--tier must be one of ${TIERS.join(', ')}`);
  if (!['merged', 'split'].includes(values.quality)) fail(NAME, '--quality must be merged or split');
  const passes = values.passes === undefined ? undefined : Number(values.passes);
  if (passes !== undefined && (!Number.isInteger(passes) || passes < 1)) fail(NAME, '--passes needs a positive integer');
  const seed = values.seed === undefined ? freshSeed() : parseSeed(values.seed);
  if (seed === null) fail(NAME, '--seed needs an integer from 0 to 2^32-1');

  const root = repoRoot(resolve(values.repo));
  if (!root) fail(NAME, `not a git repository: ${resolve(values.repo)}`);
  const paths = splitCsv(values.paths);
  const exclude = splitCsv(values.exclude);
  const target = values.snapshot ? fromSnapshot(root, paths, exclude) : fromDiff(root, values, paths, exclude);

  const out = resolve(values.out);
  for (const dir of ['parts', 'spawns', 'hunks', 'returns', 'verify', 'verdicts']) mkdirSync(join(out, dir), { recursive: true });

  const weight = target.units.filter((u) => u.classes.includes('code') || u.classes.includes('data')).reduce((n, u) => n + u.weight, 0);
  const tier = values.tier ?? tierFor(target.mode, weight);
  const reviewers = decideReviewers(target.units, {
    tier,
    quality: values.quality,
    passes,
    extra: splitCsv(values.extra),
    skip: splitCsv(values.skip),
    mechanical: target.mechanical.length > 0,
  });

  for (const u of target.units) writeFileSync(join(out, 'hunks', `${safeName(u.path)}.diff`), u.rendered);
  const mechanicalPath = target.mechanical.length ? join(out, 'mechanical.md') : null;
  if (mechanicalPath) writeFileSync(mechanicalPath, mechanicalSummary(target.mechanical));
  if (target.secrets.length) {
    const findings = target.secrets.map((path) => ({
      reviewer: 'secrets',
      pass: 1,
      file: path,
      line: 1,
      severity: 'CRITICAL',
      confidence: 'VERIFIED',
      claim_class: 'static',
      root_cause_key: `security:${path}:secret-file`,
      title: `Secret file \`${path}\` is in the ${target.mode === 'diff' ? 'change' : 'repo'}`,
      evidence: 'Matched by file name; its contents were not read.',
      impact: 'A committed credential is exposed to everyone with access to the history.',
      fix: 'Remove the file, rotate the credential and ignore the path.',
      trigger: null,
      rule: null,
      pre_existing: 'no',
      observation: null,
      needs_observation: null,
    }));
    writeFileSync(join(out, 'returns', 'secrets.json'), JSON.stringify(findings, null, 2));
  }

  const logicPaths = new Set(target.units.filter(isLogic).map((u) => u.path));
  const expanded = expandUnits(target.units);
  const spawns = [];
  const skipped = [];
  for (const [reviewer, decision] of Object.entries(reviewers)) {
    if (!decision.spawn) { skipped.push({ reviewer, reason: decision.reason }); continue; }
    for (let pass = 1; pass <= decision.passes; pass++) {
      const allowed = new Set(pass === 1 ? decision.files : decision.secondPassFiles);
      const units = expanded.filter((u) => allowed.has(u.path));
      const chunks = units.length ? chunksForPass(units, seed, reviewer, pass) : [{ units: [], bytes: 0 }];
      chunks.forEach((chunk, index) => {
        const id = `${reviewer}.p${pass}.c${index + 1}`;
        const texts = chunk.units.map((u) => u.rendered);
        const partPaths = parts(texts, PART_BYTES).map((text, k) => {
          const path = join(out, 'parts', `${id}.${k + 1}.diff`);
          writeFileSync(path, text);
          return path;
        });
        const files = [...new Set(chunk.units.map((u) => u.path))];
        const budget = budgetFor(reviewer, chunk.bytes);
        const wantsMechanical = (reviewer === 'quality' || reviewer === '04-consistency-history') && index === 0 ? mechanicalPath : null;
        const prompt = join(out, 'spawns', `${id}.md`);
        writeFileSync(prompt, spawnPrompt({ mode: target.mode, reviewer, pass, budget, chunk: index + 1, of: chunks.length, files, partPaths, mechanicalPath: wantsMechanical }));
        spawns.push({
          id, reviewer, pass, chunk: index + 1, of: chunks.length, model: decision.model, effort: values.effort ?? null, budget,
          bytes: chunk.bytes, personas: personasFor(reviewer), prompt, returns: join(out, 'returns', `${id}.json`), files,
        });
      });
    }
  }

  const estimated = spawns.reduce((n, s) => n + estimateTokens(s.bytes, s.budget), 0);
  const preview = {
    reviewers: spawns.length,
    opus: spawns.filter((s) => s.model === 'opus').length,
    sonnet: spawns.filter((s) => s.model === 'sonnet').length,
    files: target.units.length,
    mechanical: target.mechanical.length,
    weight,
    estimatedMillionTokens: Math.round(estimated / 100000) / 10,
  };
  const plan = {
    root, mode: target.mode, tier, ask: tier === 'large', empty: spawns.length === 0, seed, packet: out,
    quality: values.quality, preview, spawns, skipped,
    logicFiles: logicPaths.size, excluded: target.excluded, secrets: target.secrets,
    mechanical: target.mechanical.map((f) => f.path), modules: target.modules ?? null,
  };
  writeFileSync(join(out, 'plan.json'), JSON.stringify(plan, null, 2));
  emit({
    packet: out, mode: plan.mode, tier, ask: plan.ask, empty: plan.empty, seed, preview,
    spawns: spawns.map(({ id, model, effort, personas, prompt, returns }) => ({ id, model, effort, personas, prompt, returns })),
    skipped, excluded: plan.excluded, secrets: plan.secrets,
  });
}

main();
