import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { gitRepo, run, tempDir, writeFiles } from './helpers.mjs';

const SAVE = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'plugin', 'scripts', 'save.mjs');

function save(data, ...args) {
  // A port nothing listens on, so `site` is false whether or not belay serve is up.
  return saveWith({ BELAY_PORT: '1' }, data, ...args);
}

function saveWith(env, data, ...args) {
  const res = spawnSync(process.execPath, [SAVE, ...args], { encoding: 'utf8', env: { ...process.env, BELAY_DATA: data, ...env } });
  assert.equal(res.status, 0, res.stderr);
  return JSON.parse(res.stdout);
}

const readJson = (path) => JSON.parse(readFileSync(path, 'utf8'));

const finding = (key, severity, extra = {}) => ({
  reviewer: '02-bugs-security', pass: 1, file: 'a.ts', line: 2, severity, confidence: 'HIGH', claim_class: 'static',
  root_cause_key: key, title: `${key} title`, evidence: 'x', impact: 'imp', fix: 'fx', trigger: null, rule: null,
  pre_existing: 'no', observation: null, needs_observation: null, ...extra,
});

function packet() {
  const lines = Array.from({ length: 60 }, (_, i) => `line ${i + 1}`);
  const repo = gitRepo({ 'a.ts': `${lines.join('\n')}\n`, 'b.ts': 'x\n' });
  lines[1] = 'changed 2';
  lines[49] = 'changed 50';
  writeFiles(repo, { 'a.ts': `${lines.join('\n')}\n`, 'b.ts': 'y\n' });
  const out = tempDir();
  const res = run('plan.mjs', { args: ['--repo', repo, '--out', out, '--uncommitted'] });
  assert.equal(res.code, 0, res.stderr);
  return { repo, out, plan: readJson(join(out, 'plan.json')) };
}

const collect = (out, ...args) => {
  const res = run('collect.mjs', { args: ['--packet', out, ...args] });
  assert.equal(res.code, 0, res.stderr);
  return res.json;
};

function stages(data, id) {
  return Object.fromEntries(readJson(join(data, 'reviews', id, 'review.json')).stages.map((s) => [s.name, s.of === undefined ? s.status : `${s.status} ${s.done}/${s.of}`]));
}

test('init makes a review folder whose id is dated, slugged and never reused', () => {
  const data = tempDir();
  const a = save(data, 'init', '--target', 'PR #12: Fix the Login!', '--root', '.', '--project', 'bel', '--campaign', '4/12');
  assert.match(a.id, /^review-\d{8}-\d{4}-pr-12-fix-the-login$/);
  const review = readJson(join(a.dir, 'review.json'));
  assert.equal(review.project, 'BEL');
  assert.equal(review.status, 'running');
  assert.deepEqual(review.campaign, { unit: 4, of: 12 });
  assert.deepEqual(review.stages.map((s) => s.status), ['doing', 'todo', 'todo', 'todo', 'todo']);
  const b = save(data, 'init', '--target', 'PR #12: Fix the Login!', '--root', '.');
  assert.notEqual(b.id, a.id);
  assert.equal(b.id.length <= 64, true);
  assert.equal(save(data, 'init', '--target', 'x'.repeat(200), '--root', '.').id.length <= 64, true);
});

test('progress follows the packet; findings being checked show with their verdicts as they arrive; finish numbers them in report order', () => {
  const data = tempDir();
  const { id } = save(data, 'init', '--target', 'uncommitted', '--root', '.');
  const { out, plan } = packet();
  save(data, 'progress', '--id', id, '--packet', out, '--checks', 'doing');
  assert.deepEqual(stages(data, id), { plan: 'done', checks: 'doing', reviewers: `todo 0/${plan.spawns.length}`, verifiers: 'todo', report: 'todo' });
  save(data, 'progress', '--id', id, '--packet', out, '--checks', 'done');
  assert.equal(stages(data, id).reviewers, `doing 0/${plan.spawns.length}`);

  const byFirst = {
    findings: [
      finding('style:a.ts:y', 'SUGGESTED', { line: 50 }),
      finding('missing-null-check:a.ts:x', 'IMPORTANT'),
      finding('dead-code:b.ts:z', 'DEBT', { file: 'b.ts', line: 1 }),
      finding('other:a.ts:old', 'IMPORTANT', { pre_existing: 'noticed', line: 50 }),
    ],
    reviewed: plan.spawns[0].files,
    skipped: [],
  };
  plan.spawns.forEach((s, i) => writeFileSync(s.returns, JSON.stringify(i ? { findings: [], reviewed: s.files, skipped: [] } : byFirst)));
  writeFileSync(join(out, 'returns', 'checks.json'), JSON.stringify([finding('rule-violation:a.ts:lint', 'IMPORTANT', { reviewer: 'checks', confidence: 'VERIFIED', title: 'Lint fails' })]));
  const c = collect(out);
  save(data, 'progress', '--id', id, '--packet', out);
  assert.equal(stages(data, id).reviewers, `done ${plan.spawns.length}/${plan.spawns.length}`);
  assert.equal(stages(data, id).verifiers, `doing 0/${c.verifiers.length}`);
  const checking = readJson(join(data, 'reviews', id, 'checking.json'));
  assert.equal(checking.length, 5);
  assert.deepEqual(checking.filter((x) => x.verdict).map((x) => x.title), ['Lint fails']);

  const verdictFor = (key) => (key.startsWith('dead-code') ? 'refuted' : 'confirmed');
  for (const v of c.verifiers) {
    const { groups } = readJson(v.input);
    writeFileSync(v.output, JSON.stringify(groups.map((g) => ({ root_cause_key: g.root_cause_key, verdict: verdictFor(g.root_cause_key), severity: g.severity, reason: 'r' }))));
  }
  save(data, 'progress', '--id', id, '--packet', out);
  assert.equal(stages(data, id).verifiers, `done ${c.verifiers.length}/${c.verifiers.length}`);
  assert.equal(readJson(join(data, 'reviews', id, 'checking.json')).every((x) => x.verdict), true);

  collect(out, '--verdicts');
  const summary = save(data, 'finish', '--id', id, '--packet', out);
  const dir = join(data, 'reviews', id);
  const findings = readJson(join(dir, 'findings.json'));
  assert.deepEqual(
    findings.map((f) => [f.n, f.section, f.must_fix, f.kind]),
    [
      [1, 'important', true, 'missing-null-check'],
      [2, 'important', true, 'rule-violation'],
      [3, 'suggested', false, 'style'],
      [4, 'already', false, 'other'],
      [5, 'refuted', false, 'dead-code'],
    ],
  );
  assert.deepEqual(summary.mustFix.map((f) => f.n), [1, 2]);
  assert.equal(summary.more, 3);
  assert.equal(summary.site, false);
  assert.match(summary.url, new RegExp(`/r/${id}$`));
  assert.equal(existsSync(join(dir, 'checking.json')), false);
  const review = readJson(join(dir, 'review.json'));
  assert.equal(review.status, 'done');
  assert.equal(review.stages.every((s) => s.status === 'done' && s.finished), true);

  const hunk = readJson(join(dir, 'hunks', '1.json'));
  assert.equal(hunk.file, 'a.ts');
  const flagged = hunk.lines.find((l) => l.line === 2 && l.kind === '+');
  assert.equal(flagged.text, 'changed 2');
  assert.equal(hunk.lines.some((l) => l.kind === '-' && l.text === 'line 2'), true);
  assert.equal(hunk.lines.some((l) => l.line === 50), false, 'a separate hunk stays out');
  assert.equal(readJson(join(dir, 'hunks', '3.json')).lines.some((l) => l.line === 50 && l.kind === '+'), true);
  const coverage = readJson(join(dir, 'coverage.json'));
  assert.equal(coverage.files, 2);
  assert.deepEqual(coverage.neverReviewed, []);
});

test("a secret file's contents are never saved", () => {
  const data = tempDir();
  const repo = gitRepo({ 'a.ts': 'x\n' });
  writeFiles(repo, { '.env': 'TOKEN=hunter2\n', 'a.ts': 'y\n' });
  const out = tempDir();
  assert.equal(run('plan.mjs', { args: ['--repo', repo, '--out', out, '--uncommitted'] }).code, 0);
  const plan = readJson(join(out, 'plan.json'));
  assert.deepEqual(plan.secrets, ['.env']);
  // Even a hunk that somehow named it stays out.
  writeFileSync(join(out, 'hunks', '.env.diff'), '=== .env (added) ===\n@@\n     1 +TOKEN=hunter2\n');
  for (const s of plan.spawns) writeFileSync(s.returns, JSON.stringify({ findings: [], reviewed: s.files, skipped: [] }));
  collect(out);
  collect(out, '--verdicts');
  const { id } = save(data, 'init', '--target', 'uncommitted', '--root', repo);
  save(data, 'finish', '--id', id, '--packet', out);
  const dir = join(data, 'reviews', id);
  const all = readdirSync(dir, { recursive: true }).filter((p) => p.endsWith('.json')).map((p) => readFileSync(join(dir, p), 'utf8')).join('\n');
  assert.match(all, /\.env/);
  assert.doesNotMatch(all, /hunter2/);
});

test('an empty review finishes with no findings; stop marks a running one', () => {
  const data = tempDir();
  const { id } = save(data, 'init', '--target', 'nothing', '--root', '.');
  save(data, 'finish', '--id', id, '--partial', '02-bugs-security did not return');
  const review = readJson(join(data, 'reviews', id, 'review.json'));
  assert.equal(review.partial, '02-bugs-security did not return');
  assert.deepEqual(readJson(join(data, 'reviews', id, 'findings.json')), []);
  const other = save(data, 'init', '--target', 'other', '--root', '.');
  assert.deepEqual(save(data, 'stop', '--id', other.id), { id: other.id, status: 'stopped' });
  assert.deepEqual(save(data, 'stop', '--id', id), { id, status: 'done' });
});

test("a campaign's rollup saves as one more review, one finding per root cause with every site", () => {
  const data = tempDir();
  const { id } = save(data, 'init', '--target', 'campaign rollup', '--root', '.', '--campaign', 'rollup/12');
  const rollup = join(tempDir(), 'rollup.json');
  const unitA = { ...finding('injection:a.ts:q', 'CRITICAL'), verdict: 'confirmed', sites: ['a.ts:2'], found_by: ['02-bugs-security'] };
  const unitB = { ...finding('injection:a.ts:q', 'IMPORTANT', { file: 'b.ts', line: 9 }), verdict: 'confirmed', sites: ['b.ts:9', 'b.ts:20'], found_by: ['06-security-deep-dive'] };
  writeFileSync(rollup, JSON.stringify([{ root_cause_key: 'injection:a.ts:q', findings: [unitB, unitA], found_by: ['02-bugs-security', '06-security-deep-dive'], severity: 'CRITICAL' }]));
  save(data, 'finish', '--id', id, '--merged', rollup);
  const [f] = readJson(join(data, 'reviews', id, 'findings.json'));
  assert.deepEqual([f.n, f.section, f.file, f.sites], [1, 'critical', 'a.ts', ['b.ts:9', 'b.ts:20', 'a.ts:2']]);
  assert.deepEqual(readJson(join(data, 'reviews', id, 'review.json')).campaign, { unit: 'rollup', of: 12 });
});

test('finish says the site answers only in a belay claude session', async () => {
  const server = spawn(process.execPath, ['-e', "const s = require('node:http').createServer((q, r) => r.end('ok')).listen(0, '127.0.0.1', () => console.log(s.address().port))"]);
  try {
    const port = await new Promise((resolve) => server.stdout.once('data', (d) => resolve(String(d).trim())));
    const data = tempDir();
    const rollup = join(tempDir(), 'rollup.json');
    writeFileSync(rollup, '[]');
    const finish = (channel) => {
      const { id } = save(data, 'init', '--target', 'x', '--root', '.');
      return saveWith({ BELAY_PORT: port, BELAY_CHANNEL: channel }, data, 'finish', '--id', id, '--merged', rollup).site;
    };
    assert.equal(finish('1'), true);
    assert.equal(finish(''), false);
  } finally {
    server.kill();
  }
});

test('a bad id or a missing review fails without writing', () => {
  const data = tempDir();
  for (const id of ['../x', 'review-missing']) {
    const res = spawnSync(process.execPath, [SAVE, 'stop', '--id', id], { encoding: 'utf8', env: { ...process.env, BELAY_DATA: data } });
    assert.equal(res.status, 2);
  }
});
