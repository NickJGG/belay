import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { gitRepo, run, tempDir, writeFiles } from './helpers.mjs';

const finding = (key, severity, extra = {}) => ({
  reviewer: '02-bugs-security', pass: 1, file: 'a.ts', line: 1, severity, confidence: 'HIGH', claim_class: 'static',
  root_cause_key: key, title: key, evidence: 'x', impact: 'y', fix: 'z', trigger: null, rule: null, pre_existing: 'no', observation: null, needs_observation: null, ...extra,
});

function packet() {
  const repo = gitRepo({ 'a.ts': 'x\n' });
  writeFiles(repo, { 'a.ts': 'y\n' });
  const out = tempDir();
  const res = run('plan.mjs', { args: ['--repo', repo, '--out', out, '--uncommitted'] });
  assert.equal(res.code, 0, res.stderr);
  return { out, plan: JSON.parse(readFileSync(join(out, 'plan.json'), 'utf8')) };
}

function collect(out, ...args) {
  const res = run('collect.mjs', { args: ['--packet', out, ...args] });
  assert.equal(res.code, 0, res.stderr);
  return res.json;
}

function returnAll(plan, byId = {}) {
  for (const s of plan.spawns) {
    writeFileSync(s.returns, JSON.stringify(byId[s.id] ?? { findings: [], reviewed: s.files, skipped: [] }));
  }
}

test('a spawn with no return, or a bad one, is reported, never treated as clean', () => {
  const { out, plan } = packet();
  writeFileSync(plan.spawns[0].returns, 'not json');
  const r = collect(out);
  assert.equal(r.complete, false);
  assert.deepEqual(r.malformed, [plan.spawns[0].id]);
  assert.deepEqual(r.missing, plan.spawns.slice(1).map((s) => s.id));
});

test('a bare array is malformed for a reviewer: the coverage is missing', () => {
  const { out, plan } = packet();
  returnAll(plan);
  writeFileSync(plan.spawns[0].returns, '[]');
  assert.deepEqual(collect(out).malformed, [plan.spawns[0].id]);
});

test('files a reviewer neither reviewed nor skipped are unaccounted; skipped ones are listed', () => {
  const { out, plan } = packet();
  const [a, b] = plan.spawns;
  returnAll(plan, {
    [a.id]: { findings: [], reviewed: [], skipped: [] },
    [b.id]: { findings: [], reviewed: [], skipped: [{ path: 'a.ts', reason: 'too generated' }] },
  });
  const r = collect(out);
  assert.deepEqual(r.unaccounted, [{ spawn: a.id, files: ['a.ts'] }]);
  assert.deepEqual(r.skipped, [{ spawn: b.id, path: 'a.ts', reason: 'too generated' }]);
  assert.equal(r.complete, true);
});

test('a file nobody reviewed is flagged even when each spawn returned', () => {
  const { out, plan } = packet();
  returnAll(plan, Object.fromEntries(plan.spawns.map((s) => [s.id, { findings: [], reviewed: [], skipped: [{ path: 'a.ts', reason: 'n/a' }] }])));
  assert.deepEqual(collect(out).neverReviewed, ['a.ts']);
});

test('findings merge by root cause; must-fix get a verifier each, the rest batch by reviewer', () => {
  const { out, plan } = packet();
  const [a, b] = plan.spawns;
  returnAll(plan, {
    [a.id]: { findings: [finding('k:a.ts:one', 'CRITICAL'), finding('k:a.ts:two', 'DEBT'), finding('k:a.ts:three', 'SUGGESTED')], reviewed: a.files, skipped: [] },
    [b.id]: { findings: [finding('K:a.ts:one', 'IMPORTANT', { reviewer: '07-performance', line: 9 })], reviewed: b.files, skipped: [] },
  });
  const r = collect(out);
  assert.equal(r.findings, 4);
  assert.equal(r.groups, 3);
  const single = r.verifiers.filter((v) => v.mode === 'single');
  const batch = r.verifiers.filter((v) => v.mode === 'batch');
  assert.deepEqual(single.map((v) => v.model), ['opus']);
  assert.deepEqual(batch.map((v) => v.model), ['sonnet']);
  const input = JSON.parse(readFileSync(single[0].input, 'utf8'));
  assert.deepEqual(input.groups[0].found_by, ['02-bugs-security', '07-performance']);
  assert.equal(JSON.parse(readFileSync(batch[0].input, 'utf8')).groups.length, 2);
  assert.ok(single[0].hunks[0].endsWith('a.ts.diff'));
});

test('verdicts join into merged.json, with all sites, override and severity', () => {
  const { out, plan } = packet();
  const [a, b] = plan.spawns;
  returnAll(plan, {
    [a.id]: { findings: [finding('k:a.ts:one', 'CRITICAL'), finding('k:a.ts:two', 'DEBT')], reviewed: a.files, skipped: [] },
    [b.id]: { findings: [finding('k:a.ts:one', 'IMPORTANT', { line: 9, pass: 2 })], reviewed: b.files, skipped: [] },
  });
  const { verifiers } = collect(out);
  const single = verifiers.find((v) => v.mode === 'single');
  const batch = verifiers.find((v) => v.mode === 'batch');
  writeFileSync(single.output, JSON.stringify([{ root_cause_key: 'k:a.ts:one', verdict: 'confirmed', severity: 'IMPORTANT', reason: 'traced', pre_existing: 'noticed' }]));
  assert.deepEqual(collect(out, '--verdicts').missing, [batch.id]);
  writeFileSync(batch.output, JSON.stringify([{ root_cause_key: 'k:a.ts:two', verdict: 'refuted', reason: 'guarded' }]));
  const joined = collect(out, '--verdicts');
  assert.equal(joined.complete, true);
  assert.deepEqual(joined.counts, { confirmed: 1, refuted: 1 });
  const merged = JSON.parse(readFileSync(joined.merged, 'utf8'));
  const one = merged.find((m) => m.root_cause_key === 'k:a.ts:one');
  assert.deepEqual(one.sites, ['a.ts:1', 'a.ts:9']);
  assert.deepEqual(one.passes, [1, 2]);
  assert.equal(one.severity, 'IMPORTANT');
  assert.equal(one.pre_existing, 'noticed');
});

test('a verdict array of the wrong length is malformed', () => {
  const { out, plan } = packet();
  returnAll(plan, { [plan.spawns[0].id]: { findings: [finding('k:a.ts:one', 'CRITICAL')], reviewed: plan.spawns[0].files, skipped: [] } });
  const { verifiers } = collect(out);
  writeFileSync(verifiers[0].output, '[]');
  assert.deepEqual(collect(out, '--verdicts').malformed, [verifiers[0].id]);
});

test('check and secret findings skip verification; other files in returns do not', () => {
  const { out, plan } = packet();
  returnAll(plan);
  writeFileSync(join(out, 'returns', 'checks.json'), JSON.stringify([finding('other:a.ts:typecheck', 'IMPORTANT', { reviewer: 'checks', confidence: 'VERIFIED' })]));
  writeFileSync(join(out, 'returns', 'variants-1.json'), JSON.stringify([finding('k:a.ts:variant', 'CRITICAL')]));
  const r = collect(out);
  assert.equal(r.proven, 1);
  assert.deepEqual(r.verifiers, []);
  const merged = JSON.parse(readFileSync(collect(out, '--verdicts').merged, 'utf8'));
  assert.deepEqual(merged.map((m) => [m.root_cause_key, m.verdict]), [['other:a.ts:typecheck', 'confirmed']]);
});

test('--add gives later findings their own verifiers and they join merged.json', () => {
  const { out, plan } = packet();
  returnAll(plan, { [plan.spawns[0].id]: { findings: [finding('k:a.ts:one', 'CRITICAL')], reviewed: plan.spawns[0].files, skipped: [] } });
  const first = collect(out).verifiers[0];
  writeFileSync(first.output, JSON.stringify([{ verdict: 'confirmed', reason: 'yes' }]));
  const file = join(out, 'variants-1.json');
  writeFileSync(file, JSON.stringify([finding('k:b.ts:one', 'CRITICAL', { reviewer: 'variants', file: 'b.ts' })]));
  const added = collect(out, '--add', file).verifiers[0];
  assert.notEqual(added.id, first.id);
  writeFileSync(added.output, JSON.stringify([{ verdict: 'refuted', reason: 'no' }]));
  const joined = collect(out, '--verdicts');
  assert.deepEqual(joined.counts, { confirmed: 1, refuted: 1 });
});

test('collect is idempotent, so a retried reviewer just means running it again', () => {
  const { out, plan } = packet();
  returnAll(plan, { [plan.spawns[0].id]: { findings: [finding('k:a.ts:one', 'CRITICAL')], reviewed: plan.spawns[0].files, skipped: [] } });
  assert.deepEqual(collect(out).verifiers.map((v) => v.id), collect(out).verifiers.map((v) => v.id));
});

test('a packet with no plan exits 2', () => {
  assert.equal(run('collect.mjs', { args: ['--packet', tempDir()] }).code, 2);
  assert.equal(run('collect.mjs', { args: [] }).code, 2);
});
