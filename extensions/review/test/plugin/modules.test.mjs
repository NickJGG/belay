import assert from 'node:assert/strict';
import { rmSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { gitRepo, run, tempDir } from './helpers.mjs';

const modules = (dir, args = []) => {
  const res = run('modules.mjs', { args: ['--repo', dir, ...args] });
  assert.equal(res.code, 0, res.stderr);
  return res.json;
};
const byName = (out) => Object.fromEntries(out.modules.map((m) => [m.name, m]));
const paths = (mod) => mod.files.map((f) => f.path);

function sampleRepo() {
  return gitRepo({
    'package.json': JSON.stringify({ workspaces: ['packages/*'] }),
    'README.md': 'hello',
    'packages/core/package.json': '{}',
    'packages/core/src/index.ts': 'export const x = 1;\n',
    'packages/core/src/nested/deep.ts': 'export {};\n',
    'src/app.ts': 'console.log(1);\n',
    'src/login.tsx': 'export {};\n',
    'scripts/build.sh': 'echo hi\n',
    '.env': 'SECRET=1',
    'certs/server.pem': 'x',
    'package-lock.json': '{}',
    'dist/out.js': 'x',
    'vendor/lib.js': 'x',
    'assets/logo.png': 'x',
    'assets/blob.dat': Buffer.from([1, 0, 2, 3]),
  });
}

test('workspace packages, top-level folders and (root) become modules', () => {
  const out = modules(sampleRepo());
  assert.deepEqual(out.modules.map((m) => m.name), ['(root)', 'packages/core', 'scripts', 'src']);
  const mods = byName(out);
  assert.equal(mods['(root)'].dir, '.');
  assert.deepEqual(paths(mods['(root)']), ['README.md', 'package.json']);
  assert.deepEqual(paths(mods['packages/core']), ['packages/core/package.json', 'packages/core/src/index.ts', 'packages/core/src/nested/deep.ts']);
  assert.deepEqual(paths(mods.src), ['src/app.ts', 'src/login.tsx']);
});

test('files are records select-agents takes, and bytes sum them', () => {
  const src = byName(modules(sampleRepo())).src;
  assert.deepEqual(src.files[0], { path: 'src/app.ts', status: 'A', bytes: 16, classes: ['code'] });
  assert.ok(src.files[1].classes.includes('security'));
  assert.equal(src.bytes, src.files.reduce((n, f) => n + f.bytes, 0));
});

test('secrets, noise and binaries are excluded with a reason', () => {
  const reasons = Object.fromEntries(modules(sampleRepo()).excluded.map((e) => [e.path, e.reason]));
  assert.deepEqual(reasons, {
    '.env': 'secret',
    'certs/server.pem': 'secret',
    'package-lock.json': 'lockfile',
    'dist/out.js': 'generated',
    'vendor/lib.js': 'vendored',
    'assets/logo.png': 'binary',
    'assets/blob.dat': 'binary',
  });
});

test('--paths limits the review to those folders; --exclude lists user_rule', () => {
  const dir = sampleRepo();
  const out = modules(dir, ['--paths', 'src/,packages/core/src/nested']);
  assert.deepEqual(out.modules.map((m) => m.name), ['packages/core', 'src']);
  assert.deepEqual(paths(byName(out)['packages/core']), ['packages/core/src/nested/deep.ts']);
  assert.deepEqual(out.excluded, []);
  const excluded = modules(dir, ['--paths', 'src/', '--exclude', 'src/login']).excluded;
  assert.deepEqual(excluded, [{ path: 'src/login.tsx', reason: 'user_rule' }]);
});

test('a tracked file deleted from the working tree is skipped', () => {
  const dir = sampleRepo();
  rmSync(join(dir, 'src/app.ts'));
  assert.deepEqual(paths(byName(modules(dir)).src), ['src/login.tsx']);
});

test('outside a git repo it exits 2', () => {
  assert.equal(run('modules.mjs', { args: ['--repo', tempDir()] }).code, 2);
});
