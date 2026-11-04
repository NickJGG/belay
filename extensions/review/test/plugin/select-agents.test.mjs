import assert from 'node:assert/strict';
import { test } from 'node:test';
import { run, runJson } from './helpers.mjs';

const entry = (path, { status = 'M', classes = [], bytes = 100 } = {}) => ({ path, status, ext: path.split('.').pop(), bytes, classes });
const select = (reviewable, args) => runJson('select-agents.mjs', { reviewable, excluded: [], secrets: [], oversized: [] }, args).agents;
const spawned = (agents) => Object.keys(agents).filter((id) => agents[id].spawn).sort();

test('a config-only change gets the bug and quality reviewers, and says why the rest skipped', () => {
  const agents = select([entry('config.yaml', { classes: ['data'] })]);
  assert.deepEqual(spawned(agents), ['02-bugs-security', 'quality']);
  for (const id of ['06-security-deep-dive', '07-performance', '08-test-quality', '09-api-contract', '10-a11y-i18n']) assert.ok(agents[id].reason, id);
});

test('docs get quality only', () => {
  assert.deepEqual(spawned(select([entry('README.md', { classes: ['docs'] })])), ['quality']);
});

test('models and passes follow the kind of reviewer and the tier', () => {
  const code = [entry('main.go', { classes: ['code', 'security', 'contract'] })];
  const medium = select(code, ['--tier', 'medium']);
  for (const id of ['02-bugs-security', '06-security-deep-dive', '07-performance', '09-api-contract']) {
    assert.deepEqual([medium[id].model, medium[id].passes], ['opus', 2], id);
  }
  assert.deepEqual([medium['08-test-quality'].model, medium['08-test-quality'].passes], ['sonnet', 1]);
  assert.deepEqual([medium.quality.model, medium.quality.passes], ['sonnet', 1]);
  assert.equal(select(code, ['--tier', 'small'])['02-bugs-security'].passes, 1);
});

test('the second pass covers logic only, and is dropped when there is none', () => {
  const agents = select([entry('main.go', { classes: ['code'] }), entry('a.yaml', { classes: ['data'] }), entry('t.test.ts', { classes: ['code', 'test'] })]);
  assert.deepEqual(agents['02-bugs-security'].files, ['main.go', 'a.yaml', 't.test.ts']);
  assert.deepEqual(agents['02-bugs-security'].secondPassFiles, ['main.go']);
  assert.equal(select([entry('a.yaml', { classes: ['data'] })])['02-bugs-security'].passes, 1);
});

test('performance skips tests and deleted files; test quality skips deleted code and data', () => {
  assert.equal(select([entry('t.test.ts', { classes: ['code', 'test'] })])['07-performance'].spawn, false);
  assert.equal(select([entry('old.ts', { status: 'D', classes: ['code'] })])['07-performance'].spawn, false);
  assert.equal(select([entry('old.ts', { status: 'D', classes: ['code', 'contract'] })])['08-test-quality'].spawn, false);
  assert.equal(select([entry('data.json', { status: 'A', classes: ['data'] })])['08-test-quality'].spawn, false);
  assert.ok(select([entry('a.test.ts', { classes: ['code', 'test'] })])['08-test-quality'].spawn);
});

test('a deleted code file still reaches the bug reviewer', () => {
  assert.deepEqual(select([entry('old.ts', { status: 'D', classes: ['code'] })])['02-bugs-security'].files, ['old.ts']);
});

test('conditional reviewers get only their matching files', () => {
  const agents = select([
    entry('src/App.tsx', { classes: ['code', 'ui'] }),
    entry('src/auth.ts', { classes: ['code', 'security'] }),
    entry('src/api/users.ts', { classes: ['code', 'contract'] }),
  ]);
  assert.deepEqual(agents['10-a11y-i18n'].files, ['src/App.tsx']);
  assert.deepEqual(agents['06-security-deep-dive'].files, ['src/auth.ts']);
  assert.deepEqual(agents['09-api-contract'].files, ['src/api/users.ts']);
  assert.equal(agents.quality.files.length, 3);
});

test('--quality split runs the four areas apart', () => {
  const agents = select([entry('main.go', { classes: ['code'] })], ['--quality', 'split']);
  assert.ok(!agents.quality);
  for (const id of ['01-standards', '03-dry-smells', '04-consistency-history', '05-simplification']) assert.equal(agents[id].spawn, true, id);
});

test('chunks follow bytes, not file count', () => {
  const many = Array.from({ length: 85 }, (_, i) => entry(`src/f${i}.ts`, { classes: ['code'] }));
  assert.equal(select(many).quality.chunks.length, 1);
  const { chunks } = select([
    entry('a/a.ts', { bytes: 100000, classes: ['code'] }),
    entry('b/b.ts', { bytes: 100000, classes: ['code'] }),
    entry('c/c.ts', { bytes: 20000, classes: ['code'] }),
  ]).quality;
  assert.deepEqual(chunks, [['a/a.ts', 'c/c.ts'], ['b/b.ts']]);
});

test('a budget grows with the slice, within its kind', () => {
  const small = select([entry('a.ts', { bytes: 1000, classes: ['code'] })]);
  const large = select([entry('a.ts', { bytes: 200000, classes: ['code'] })]);
  assert.ok(small['02-bugs-security'].budget < large['02-bugs-security'].budget);
  assert.equal(large['02-bugs-security'].budget, 30);
});

test('--skip overrides a reviewer; --extra adds one with every file', () => {
  const agents = select([entry('main.go', { classes: ['code'] })], ['--skip', 'quality', '--extra', '10-a11y-i18n']);
  assert.equal(agents.quality.spawn, false);
  assert.equal(agents.quality.reason, 'skipped by --skip');
  assert.deepEqual(agents['10-a11y-i18n'].files, ['main.go']);
});

test('empty reviewable spawns nothing', () => {
  const agents = select([]);
  assert.deepEqual(spawned(agents), []);
  for (const a of Object.values(agents)) assert.equal(a.reason, 'no reviewable files');
});

test('a bare array of records or paths is classified from the path', () => {
  const agents = runJson('select-agents.mjs', [{ path: 'src/Login.tsx', status: 'A', bytes: 10 }, 'docs/x.md']).agents;
  assert.deepEqual(agents['10-a11y-i18n'].files, ['src/Login.tsx']);
  assert.deepEqual(agents['06-security-deep-dive'].files, ['src/Login.tsx']);
  assert.deepEqual(agents['08-test-quality'].files, ['src/Login.tsx']);
});

test('malformed input exits 2', () => {
  assert.equal(run('select-agents.mjs', { input: 'nope' }).code, 2);
  assert.equal(run('select-agents.mjs', { input: JSON.stringify({ excluded: [] }) }).code, 2);
  assert.equal(run('select-agents.mjs', { input: JSON.stringify({ reviewable: [{ status: 'M' }] }) }).code, 2);
});
