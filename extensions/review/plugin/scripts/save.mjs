#!/usr/bin/env node
// save: keeps a review in Belay's data dir (reviews/<id>/) while it runs and once it's reported, for
// the site and `belay review`. Nothing in a review reads a saved one back. Shapes: references/formats.md.
//
//   init --target <text> --root <dir> [--ref r] [--project KEY] [--campaign <unit>/<of>]   prints {id, dir};
//        a campaign's unit is its number, cross-module or rollup
//   progress --id <id> --packet <dir> [--checks doing|done]   stage progress and findings being checked
//   finish --id <id> [--packet <dir>] [--merged <file>] [--partial <text>]
//        numbered findings, coverage, hunks; prints the summary. --merged replaces the packet's merged.json
//        (a campaign's rollup.json)
//   stop --id <id>                                            a review that won't finish
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { args, emit, fail } from './lib/cli.mjs';
import { reviewsHome, writeJsonAtomic } from './lib/data.mjs';
import { severityRank } from './lib/dedupe.mjs';

const NAME = 'save';
const ID = /^[a-z0-9][a-z0-9-]{0,63}$/;
const STAGES = ['plan', 'checks', 'reviewers', 'verifiers', 'report'];
const STEP = { todo: 0, doing: 1, done: 2 };
const SECTIONS = ['critical', 'important', 'unverified', 'debt', 'suggested', 'question', 'plausible', 'already', 'refuted'];
const BY_SEVERITY = ['critical', 'important', 'debt', 'suggested', 'question'];
// Lines kept either side of the flagged one; the site reads further context from the repo.
const HUNK_RADIUS = 20;
const PORT = Number(process.env.BELAY_PORT) || 4747;

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return undefined;
  }
}

const now = () => new Date().toISOString();
const pad = (n) => String(n).padStart(2, '0');

function reviewDir(id) {
  if (!ID.test(id ?? '')) fail(NAME, `'${id}' is not a review id`);
  const dir = join(reviewsHome(), id);
  if (!existsSync(join(dir, 'review.json'))) fail(NAME, `no review '${id}' in ${reviewsHome()}`);
  return dir;
}

function slug(text) {
  const s = String(text ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return (s.slice(0, 40).replace(/-+$/, '') || 'review');
}

function init(values) {
  if (!values.target) fail(NAME, '--target <text> is required');
  if (!values.root) fail(NAME, '--root <dir> is required');
  let campaign = null;
  if (values.campaign) {
    const m = /^(\d+|cross-module|rollup)\/(\d+)$/.exec(values.campaign);
    if (!m) fail(NAME, '--campaign needs <unit>/<of>, e.g. 4/12 or rollup/12');
    campaign = { unit: /^\d+$/.test(m[1]) ? Number(m[1]) : m[1], of: Number(m[2]) };
  }
  const d = new Date();
  const base = `review-${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}-${slug(values.target)}`;
  mkdirSync(reviewsHome(), { recursive: true });
  let id = base;
  for (let n = 2; ; n++) {
    try {
      mkdirSync(join(reviewsHome(), id));
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      id = `${base}-${n}`;
    }
  }
  const at = d.toISOString();
  const review = {
    id,
    project: values.project?.toUpperCase() || null,
    root: resolve(values.root),
    target: values.target,
    ref: values.ref ?? null,
    mode: null,
    tier: null,
    seed: null,
    preview: null,
    started: at,
    finished: null,
    status: 'running',
    partial: null,
    campaign,
    stages: STAGES.map((name) => (name === 'plan' ? { name, status: 'doing', started: at, finished: null } : { name, status: 'todo', started: null, finished: null })),
  };
  const dir = join(reviewsHome(), id);
  writeJsonAtomic(join(dir, 'review.json'), review);
  return { id, dir };
}

// A stage only moves forward: a retried reviewer never sends a finished stage back to doing.
function advance(review, name, status, counts = {}) {
  const s = review.stages.find((x) => x.name === name);
  Object.assign(s, counts);
  if (STEP[status] <= STEP[s.status]) return;
  const at = now();
  s.status = status;
  s.started ??= at;
  if (status === 'done') s.finished = at;
}

function verifyFiles(packet) {
  const dir = join(packet, 'verify');
  return existsSync(dir) ? readdirSync(dir).filter((n) => n.endsWith('.json')).sort() : [];
}

function checking(packet) {
  const out = [];
  for (const name of verifyFiles(packet)) {
    const { groups = [] } = readJson(join(packet, 'verify', name)) ?? {};
    const verdicts = readJson(join(packet, 'verdicts', name));
    groups.forEach((g, i) => {
      const lead = g.findings.reduce((best, f) => (severityRank(f.severity) < severityRank(best.severity) ? f : best));
      out.push({ key: g.root_cause_key, title: lead.title, file: lead.file, line: lead.line, severity: g.severity, verdict: Array.isArray(verdicts) ? (verdicts[i]?.verdict ?? null) : null });
    });
  }
  for (const g of readJson(join(packet, 'proven.json')) ?? []) {
    const f = g.findings[0];
    out.push({ key: g.root_cause_key, title: f.title, file: f.file, line: f.line, severity: g.severity, verdict: 'confirmed' });
  }
  return out;
}

function progress(values) {
  if (!values.packet) fail(NAME, '--packet <dir> is required');
  const dir = reviewDir(values.id);
  const review = readJson(join(dir, 'review.json'));
  const packet = resolve(values.packet);
  const plan = readJson(join(packet, 'plan.json'));
  if (plan) {
    Object.assign(review, { mode: plan.mode, tier: plan.tier, seed: plan.seed, preview: plan.preview });
    advance(review, 'plan', 'done');
  }
  if (values.checks) {
    if (!['doing', 'done'].includes(values.checks)) fail(NAME, '--checks must be doing or done');
    advance(review, 'checks', values.checks);
  }
  const collected = existsSync(join(packet, 'proven.json'));
  if (plan) {
    const of = plan.spawns.length;
    const done = plan.spawns.filter((s) => existsSync(s.returns)).length;
    const checksDone = review.stages.find((s) => s.name === 'checks').status === 'done';
    advance(review, 'reviewers', collected || plan.empty || (of > 0 && done === of) ? 'done' : checksDone || done > 0 ? 'doing' : 'todo', { done, of });
  }
  if (collected) {
    const files = verifyFiles(packet);
    const done = files.filter((n) => existsSync(join(packet, 'verdicts', n))).length;
    advance(review, 'verifiers', done === files.length ? 'done' : 'doing', { done, of: files.length });
    writeJsonAtomic(join(dir, 'checking.json'), checking(packet));
  }
  writeJsonAtomic(join(dir, 'review.json'), review);
  return { id: review.id, stages: review.stages.map((s) => `${s.name}:${s.status}${s.of !== undefined ? ` ${s.done}/${s.of}` : ''}`).join(' ') };
}

function sectionOf(f) {
  if (f.verdict === 'refuted') return 'refuted';
  if (f.pre_existing === 'noticed') return 'already';
  if (f.verdict === 'plausible') return 'plausible';
  if (f.verdict === 'unverified') return 'unverified';
  return BY_SEVERITY[severityRank(f.severity)] ?? 'question';
}

// A rollup holds groups of merged findings from several units: one finding, with every site.
function flattenGroup(entry) {
  if (!Array.isArray(entry.findings)) return entry;
  const lead = entry.findings.reduce((best, f) => (severityRank(f.severity) < severityRank(best.severity) ? f : best));
  const sites = [...new Set(entry.findings.flatMap((f) => f.sites ?? [`${f.file}:${f.line}`]))];
  return { ...lead, sites, found_by: entry.found_by ?? lead.found_by, severity: entry.severity ?? lead.severity };
}

function numbered(merged) {
  const keyed = merged.map((f) => ({ f, section: sectionOf(f) }));
  keyed.sort((a, b) =>
    SECTIONS.indexOf(a.section) - SECTIONS.indexOf(b.section)
    || severityRank(a.f.severity) - severityRank(b.f.severity)
    || String(a.f.found_by?.[0] ?? '').localeCompare(String(b.f.found_by?.[0] ?? ''))
    || String(a.f.file).localeCompare(String(b.f.file))
    || (a.f.line ?? 0) - (b.f.line ?? 0));
  return keyed.map(({ f, section }, i) => ({
    n: i + 1,
    section,
    must_fix: section === 'critical' || section === 'important',
    severity: String(f.severity ?? '').toUpperCase() || null,
    kind: String(f.root_cause_key ?? '').split(':')[0] || 'other',
    key: f.root_cause_key,
    title: f.title,
    file: f.file,
    line: f.line ?? null,
    sites: f.sites ?? [`${f.file}:${f.line}`],
    impact: f.impact ?? null,
    fix: f.fix ?? null,
    trigger: f.trigger ?? null,
    evidence: f.evidence ?? null,
    rule: f.rule ?? null,
    confidence: f.confidence ?? null,
    claim_class: f.claim_class ?? null,
    pre_existing: f.pre_existing ?? 'no',
    needs_observation: f.needs_observation ?? null,
    found_by: f.found_by ?? [f.reviewer].filter(Boolean),
    passes: f.passes ?? [],
    verdict: f.verdict,
    reason: f.reason ?? null,
  }));
}

const safeName = (path) => path.replace(/[\\/]/g, '__').replace(/[^\w.@-]/g, '_');
const RENDERED = /^\s*(\d*) ([+\- ])(.*)$/;

// The packet's rendered hunk around the flagged line: the hunk holding it, clipped to HUNK_RADIUS lines each side.
function hunkAround(rendered, line) {
  const hunks = [];
  for (const raw of rendered.split('\n').slice(1)) {
    if (raw.startsWith('@@')) { hunks.push({ context: raw.slice(2).trim(), lines: [] }); continue; }
    const m = RENDERED.exec(raw);
    if (!m) continue;
    if (!hunks.length) hunks.push({ context: '', lines: [] });
    hunks.at(-1).lines.push({ kind: m[2], line: m[1] ? Number(m[1]) : null, text: m[3] });
  }
  for (const h of hunks) {
    const at = h.lines.findIndex((l) => l.kind !== '-' && l.line === line);
    if (at === -1) continue;
    return { context: h.context, lines: h.lines.slice(Math.max(0, at - HUNK_RADIUS), at + HUNK_RADIUS + 1) };
  }
  return null;
}

// True only for a `belay claude` session (one that can attach) with the site up: the summary form's whole condition,
// so a headless or plain session always gets the full report.
async function siteAnswers() {
  if (process.env.BELAY_CHANNEL !== '1') return false;
  try {
    await fetch(`http://127.0.0.1:${PORT}/`, { signal: AbortSignal.timeout(1000) });
    return true;
  } catch {
    return false;
  }
}

async function finish(values) {
  const dir = reviewDir(values.id);
  const review = readJson(join(dir, 'review.json'));
  const packet = values.packet ? resolve(values.packet) : null;
  const plan = packet ? readJson(join(packet, 'plan.json')) : null;
  const merged = (values.merged ? readJson(resolve(values.merged)) : packet && readJson(join(packet, 'merged.json'))) ?? [];
  if (!Array.isArray(merged)) fail(NAME, `${values.merged} must hold a JSON array`);
  const findings = numbered(merged.map(flattenGroup));
  writeJsonAtomic(join(dir, 'findings.json'), findings);

  const secrets = new Set(plan?.secrets ?? []);
  rmSync(join(dir, 'hunks'), { recursive: true, force: true });
  for (const f of findings) {
    if (!packet || secrets.has(f.file) || f.line == null) continue;
    const path = join(packet, 'hunks', `${safeName(f.file)}.diff`);
    if (!existsSync(path)) continue;
    const hunk = hunkAround(readFileSync(path, 'utf8'), f.line);
    if (!hunk) continue;
    mkdirSync(join(dir, 'hunks'), { recursive: true });
    writeJsonAtomic(join(dir, 'hunks', `${f.n}.json`), { file: f.file, line: f.line, ...hunk });
  }

  const coverage = packet ? (readJson(join(packet, 'coverage.json')) ?? {}) : {};
  writeJsonAtomic(join(dir, 'coverage.json'), {
    files: plan?.preview?.files ?? 0,
    excluded: plan?.excluded ?? [],
    mechanical: plan?.mechanical ?? [],
    reviewersSkipped: plan?.skipped ?? [],
    skipped: coverage.skipped ?? [],
    unaccounted: coverage.unaccounted ?? [],
    neverReviewed: coverage.neverReviewed ?? [],
  });

  if (plan) Object.assign(review, { mode: plan.mode, tier: plan.tier, seed: plan.seed, preview: plan.preview });
  for (const name of STAGES) advance(review, name, 'done');
  Object.assign(review, { status: 'done', finished: now(), partial: values.partial ?? null });
  writeJsonAtomic(join(dir, 'review.json'), review);
  rmSync(join(dir, 'checking.json'), { force: true });

  const must = findings.filter((f) => f.must_fix);
  return {
    id: review.id,
    dir,
    url: `http://127.0.0.1:${PORT}/r/${review.id}`,
    site: await siteAnswers(),
    mustFix: must.map(({ n, severity, title, file, line }) => ({ n, severity, title, file, line })),
    more: findings.length - must.length,
    findings: join(dir, 'findings.json'),
  };
}

function stop(values) {
  const dir = reviewDir(values.id);
  const review = readJson(join(dir, 'review.json'));
  if (review.status === 'running') Object.assign(review, { status: 'stopped', finished: now() });
  writeJsonAtomic(join(dir, 'review.json'), review);
  return { id: review.id, status: review.status };
}

async function main() {
  const { values, positionals } = args(NAME, {
    target: { type: 'string' },
    root: { type: 'string' },
    ref: { type: 'string' },
    project: { type: 'string' },
    campaign: { type: 'string' },
    id: { type: 'string' },
    packet: { type: 'string' },
    checks: { type: 'string' },
    partial: { type: 'string' },
    merged: { type: 'string' },
  }, true);
  const [cmd] = positionals;
  if (cmd === 'init') return emit(init(values));
  if (cmd === 'progress') return emit(progress(values));
  if (cmd === 'finish') return emit(await finish(values));
  if (cmd === 'stop') return emit(stop(values));
  fail(NAME, `expected init, progress, finish or stop, got '${cmd ?? ''}'`);
}

await main();
