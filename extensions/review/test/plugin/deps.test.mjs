import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { run, tempDir } from './helpers.mjs';

function deps(before, after) {
  const dir = tempDir();
  writeFileSync(join(dir, 'before'), typeof before === 'string' ? before : JSON.stringify(before));
  writeFileSync(join(dir, 'after'), typeof after === 'string' ? after : JSON.stringify(after));
  return run('deps.mjs', { args: ['--before', join(dir, 'before'), '--after', join(dir, 'after')] });
}

test('added, removed, major and other bumps across sections', () => {
  const { code, json } = deps(
    { dependencies: { react: '^18.2.0', lodash: '^4.17.0', yaml: '2.8.1' }, devDependencies: { typescript: '~5.4.0' } },
    { dependencies: { react: '^19.0.0', yaml: '2.8.2', zod: '^3.23.0' }, devDependencies: { typescript: '~5.6.0' }, peerDependencies: { next: '>=15' } },
  );
  assert.equal(code, 0);
  assert.deepEqual(json.added, [
    { name: 'zod', section: 'dependencies', version: '^3.23.0' },
    { name: 'next', section: 'peerDependencies', version: '>=15' },
  ]);
  assert.deepEqual(json.removed, [{ name: 'lodash', section: 'dependencies', version: '^4.17.0' }]);
  assert.deepEqual(json.majorBumps, [{ name: 'react', section: 'dependencies', from: '^18.2.0', to: '^19.0.0' }]);
  assert.deepEqual(json.otherBumps.map((b) => b.name), ['yaml', 'typescript']);
});

test('major parse handles x-ranges, tildes, 0.x, aliases and workspace ranges', () => {
  const { json } = deps(
    { dependencies: { a: '1.x', b: '~1', c: '^0.2.0', d: 'npm:foo@^2.0.0', e: 'workspace:^1.0.0', f: '>= 1.2 < 3' } },
    { dependencies: { a: '2.x', b: '~1.5', c: '^0.3.0', d: 'npm:foo@^3.0.0', e: 'workspace:^1.1.0', f: '>= 2.0' } },
  );
  assert.deepEqual(json.majorBumps.map((b) => b.name), ['a', 'c', 'd', 'f']);
  assert.deepEqual(json.otherBumps.map((b) => b.name), ['b', 'e']);
});

test('non-semver changes go to otherBumps', () => {
  const { json } = deps(
    { dependencies: { a: 'latest', b: 'github:x/y#v1', c: '*' } },
    { dependencies: { a: 'next', b: 'github:x/y#v2', c: '^1.0.0' } },
  );
  assert.deepEqual(json.majorBumps, []);
  assert.deepEqual(json.otherBumps.map((b) => b.name), ['a', 'b', 'c']);
});

test('an empty before file means a new manifest: everything is added', () => {
  const { json } = deps('', { dependencies: { a: '1.0.0' } });
  assert.deepEqual(json.added, [{ name: 'a', section: 'dependencies', version: '1.0.0' }]);
});

test('requirements.txt pairs', () => {
  const { code, json } = deps(
    '# deps\nrequests==2.31.0\nDjango==4.2\nflask>=2.0\n-r other.txt\n',
    'requests==2.32.0\ndjango==5.0  # bumped\nnumpy==1.26.0\n',
  );
  assert.equal(code, 0);
  assert.deepEqual(json.added, [{ name: 'numpy', section: 'requirements', version: '==1.26.0' }]);
  assert.deepEqual(json.removed, [{ name: 'flask', section: 'requirements', version: '>=2.0' }]);
  assert.deepEqual(json.majorBumps, [{ name: 'django', section: 'requirements', from: '==4.2', to: '==5.0' }]);
  assert.deepEqual(json.otherBumps.map((b) => b.name), ['requests']);
});

test('bad usage and malformed manifests exit 2', () => {
  assert.equal(run('deps.mjs', { args: ['--before', 'x'] }).code, 2);
  assert.equal(run('deps.mjs', { args: ['--before', 'missing-file', '--after', 'missing-file'] }).code, 2);
  assert.equal(deps('{ not json', '{}').code, 2);
  assert.equal(deps('{"dependencies":{}}', 'a==1').code, 2);
});
