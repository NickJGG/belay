#!/usr/bin/env node
// collect: gathers what agents wrote into the packet, so findings never pass through the
// orchestrator's context until the report needs them.
//
// collect.mjs --packet <dir>: reads returns/*.json against plan.json, checks completeness and
// coverage, merges by root cause and writes verify/<id>.json, one per verifier to spawn.
// collect.mjs --packet <dir> --verdicts: joins verdicts/<id>.json to those and writes merged.json.
// collect.mjs --packet <dir> --add <file>: verifiers for findings found after the first round.
// All print a summary on stdout; shapes are in references/formats.md.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { args, emit, fail } from './lib/cli.mjs';
import { dedupe, severityRank, validFinding } from './lib/dedupe.mjs';

const NAME = 'collect';
const MUST_FIX = 2; // CRITICAL and IMPORTANT rank below this

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

const safeName = (path) => path.replace(/[\\/]/g, '__').replace(/[^\w.@-]/g, '_');

function loadReturns(packet, plan) {
  const missing = [];
  const malformed = [];
  const findings = [];
  const reviewed = new Set();
  const skipped = [];
  const unaccounted = [];
  for (const spawn of plan.spawns) {
    if (!existsSync(spawn.returns)) { missing.push(spawn.id); continue; }
    const value = readJson(spawn.returns);
    if (!value || !Array.isArray(value.findings) || !value.findings.every(validFinding)) { malformed.push(spawn.id); continue; }
    findings.push(...value.findings);
    const said = new Set(Array.isArray(value.reviewed) ? value.reviewed : []);
    for (const s of Array.isArray(value.skipped) ? value.skipped : []) {
      skipped.push({ spawn: spawn.id, path: s.path, reason: s.reason });
      said.add(s.path);
    }
    for (const r of value.reviewed ?? []) reviewed.add(r);
    const left = spawn.files.filter((f) => !said.has(f));
    if (left.length) unaccounted.push({ spawn: spawn.id, files: left });
  }
  return { missing, malformed, findings, reviewed, skipped, unaccounted };
}

// Named one by one: these two are proven by a run or a file name, so they never reach a verifier.
// Anything else in returns/ has to earn its verdict.
function loadProven(packet) {
  return ['checks.json', 'secrets.json'].flatMap((name) => {
    const value = readJson(join(packet, 'returns', name));
    return Array.isArray(value) ? value.filter(validFinding) : [];
  });
}

function verifiersFor(packet, groups, prefix = '') {
  const verifiers = [];
  const hunksOf = (group) => [...new Set(group.findings.map((f) => join(packet, 'hunks', `${safeName(f.file)}.diff`)))].filter(existsSync);
  const add = (id, mode, model, list) => {
    const input = join(packet, 'verify', `${id}.json`);
    writeFileSync(input, JSON.stringify({ mode, groups: list }, null, 2));
    verifiers.push({ id, mode, model, input, output: join(packet, 'verdicts', `${id}.json`), hunks: [...new Set(list.flatMap(hunksOf))] });
  };
  const batches = new Map();
  let n = 0;
  for (const group of groups) {
    if (severityRank(group.severity) < MUST_FIX) {
      n++;
      add(`${prefix}single-${String(n).padStart(3, '0')}`, 'single', 'opus', [group]);
    } else {
      const owner = group.found_by[0] ?? 'unknown';
      if (!batches.has(owner)) batches.set(owner, []);
      batches.get(owner).push(group);
    }
  }
  for (const [owner, list] of batches) add(`${prefix}batch-${safeName(owner)}`, 'batch', 'sonnet', list);
  return verifiers;
}

function collectFindings(packet, plan) {
  const returned = loadReturns(packet, plan);
  const groups = dedupe(returned.findings);
  const proven = dedupe(loadProven(packet));
  rmSync(join(packet, 'verify'), { recursive: true, force: true });
  rmSync(join(packet, 'verdicts'), { recursive: true, force: true });
  for (const dir of ['verify', 'verdicts']) mkdirSync(join(packet, dir), { recursive: true });
  const verifiers = verifiersFor(packet, groups);
  writeFileSync(join(packet, 'proven.json'), JSON.stringify(proven, null, 2));

  const planned = [...new Set(plan.spawns.flatMap((s) => s.files))];
  const neverReviewed = planned.filter((f) => !returned.reviewed.has(f));
  const complete = !returned.missing.length && !returned.malformed.length;
  writeFileSync(join(packet, 'coverage.json'), JSON.stringify({ skipped: returned.skipped, unaccounted: returned.unaccounted, neverReviewed }, null, 2));
  return {
    complete,
    missing: returned.missing,
    malformed: returned.malformed,
    unaccounted: returned.unaccounted,
    neverReviewed,
    skipped: returned.skipped,
    findings: returned.findings.length,
    groups: groups.length,
    proven: proven.length,
    verifiers: verifiers.map(({ id, mode, model, input, output, hunks }) => ({ id, mode, model, input, output, hunks })),
  };
}

// Findings found after the first round (a campaign's variant hunt) get verifiers of their own,
// and join the same merged.json when --verdicts runs again.
function addFindings(packet, file) {
  const findings = readJson(file);
  if (!Array.isArray(findings) || !findings.every(validFinding)) fail(NAME, `${file} must hold a JSON array of findings`);
  const verifiers = verifiersFor(packet, dedupe(findings), 'added-');
  return { findings: findings.length, verifiers };
}

function joinVerdicts(packet) {
  const missing = [];
  const malformed = [];
  const merged = [];
  const verifyDir = join(packet, 'verify');
  for (const name of readdirSync(verifyDir).sort()) {
    const id = name.replace(/\.json$/, '');
    const { groups } = readJson(join(verifyDir, name));
    const path = join(packet, 'verdicts', name);
    if (!existsSync(path)) { missing.push(id); continue; }
    const verdicts = readJson(path);
    if (!Array.isArray(verdicts) || verdicts.length !== groups.length || !verdicts.every((v) => v && typeof v.verdict === 'string')) {
      malformed.push(id);
      continue;
    }
    groups.forEach((group, i) => {
      const v = verdicts[i];
      const lead = group.findings.reduce((best, f) => (severityRank(f.severity) < severityRank(best.severity) ? f : best));
      const sites = [...new Set(group.findings.map((f) => `${f.file}:${f.line}`))];
      merged.push({
        ...lead,
        found_by: group.found_by,
        passes: [...new Set(group.findings.map((f) => f.pass))].sort(),
        sites,
        verdict: v.verdict,
        severity: v.severity ?? group.severity,
        reason: v.reason ?? null,
        reread_evidence: v.reread_evidence ?? null,
        claim_class: v.claim_class ?? lead.claim_class,
        needs_observation: v.needs_observation ?? lead.needs_observation ?? null,
        pre_existing: v.pre_existing ?? lead.pre_existing,
      });
    });
  }
  const proven = readJson(join(packet, 'proven.json')) ?? [];
  for (const group of proven) {
    merged.push({ ...group.findings[0], found_by: group.found_by, passes: [1], sites: [...new Set(group.findings.map((f) => `${f.file}:${f.line}`))], verdict: 'confirmed', severity: group.severity, reason: 'Proven by a check run this session, or by the file name.' });
  }
  merged.sort((a, b) => severityRank(a.severity) - severityRank(b.severity));
  writeFileSync(join(packet, 'merged.json'), JSON.stringify(merged, null, 2));
  const counts = {};
  for (const m of merged) counts[m.verdict] = (counts[m.verdict] ?? 0) + 1;
  return { complete: !missing.length && !malformed.length, missing, malformed, counts, merged: join(packet, 'merged.json'), coverage: join(packet, 'coverage.json') };
}

function main() {
  const { values } = args(NAME, { packet: { type: 'string' }, verdicts: { type: 'boolean', default: false }, add: { type: 'string' } });
  if (!values.packet) fail(NAME, '--packet <dir> is required');
  const plan = readJson(join(values.packet, 'plan.json'));
  if (!plan) fail(NAME, `no readable plan.json in ${values.packet}`);
  if (values.add) return emit(addFindings(values.packet, values.add));
  emit(values.verdicts ? joinVerdicts(values.packet) : collectFindings(values.packet, plan));
}

main();
