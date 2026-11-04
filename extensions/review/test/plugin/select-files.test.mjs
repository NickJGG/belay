import assert from 'node:assert/strict';
import { test } from 'node:test';
import { run, runJson } from './helpers.mjs';

const rec = (path, { status = 'M', insertions = 1, bytes = 100, diff } = {}) =>
  ({ path, status, insertions, deletions: 1, bytes, ...(diff === undefined ? {} : { diff }) });
const binary = (path) => ({ path, status: 'M', insertions: null, deletions: null, bytes: 2000 });
const select = (records, args) => runJson('select-files.mjs', records, args);
const reason = (result, path) => result.excluded.find((e) => e.path === path)?.reason ?? null;
const classes = (result, path) => result.reviewable.find((e) => e.path === path)?.classes;

test('mixed input: each file lands in the right bucket', () => {
  const result = select([
    rec('package-lock.json'), binary('assets/logo.png'), rec('.env'),
    rec('src/big.ts', { bytes: 300000 }), rec('Old.java', { status: 'D' }), rec('src/a.ts'),
    rec('node_modules/x/index.js'), rec('dist/app.js'),
  ]);
  assert.deepEqual(result.reviewable.map((f) => f.path), ['src/big.ts', 'Old.java', 'src/a.ts']);
  assert.equal(reason(result, 'package-lock.json'), 'lockfile');
  assert.equal(reason(result, 'assets/logo.png'), 'binary');
  assert.equal(reason(result, 'node_modules/x/index.js'), 'vendored');
  assert.equal(reason(result, 'dist/app.js'), 'generated');
  assert.deepEqual(result.secrets, ['.env']);
  assert.deepEqual(result.oversized, ['src/big.ts']);
  assert.equal(reason(result, '.env'), null, 'a secret is listed in secrets, not excluded');
});

test('excluded entries carry only path and reason', () => {
  assert.deepEqual(select([rec('yarn.lock')]).excluded, [{ path: 'yarn.lock', reason: 'lockfile' }]);
});

test('secret beats --paths, --exclude and being binary', () => {
  assert.deepEqual(select([rec('.env')], ['--paths', '.env']).secrets, ['.env']);
  assert.deepEqual(select([rec('.env')], ['--exclude', '.env']).secrets, ['.env']);
  assert.deepEqual(select([binary('certs/server.p12')]).secrets, ['certs/server.p12']);
});

test('a secret outside --paths is still reported', () => {
  const result = select([rec('src/a.ts'), rec('config/.env.production')], ['--paths', 'src/']);
  assert.deepEqual(result.secrets, ['config/.env.production']);
  assert.deepEqual(result.reviewable.map((f) => f.path), ['src/a.ts']);
});

test('secret patterns cover keys and credentials but not examples or public keys', () => {
  const result = select([
    rec('.npmrc'), rec('deploy/id_rsa'), rec('tls/server.key'), rec('aws/credentials'),
    rec('.env.example'), rec('deploy/id_rsa.pub'), rec('src/credentials.ts'),
  ]);
  assert.deepEqual(result.secrets, ['.npmrc', 'deploy/id_rsa', 'tls/server.key', 'aws/credentials']);
  assert.deepEqual(result.reviewable.map((f) => f.path), ['.env.example', 'deploy/id_rsa.pub', 'src/credentials.ts']);
});

test('oversized files stay reviewable', () => {
  const result = select([rec('src/huge.ts', { bytes: 500000, status: 'D' })]);
  assert.deepEqual(result.reviewable.map((f) => f.path), ['src/huge.ts']);
  assert.deepEqual(result.oversized, ['src/huge.ts']);
});

test('--max-file-diff-bytes moves the oversized limit', () => {
  assert.deepEqual(select([rec('a.ts', { bytes: 200 })], ['--max-file-diff-bytes', '100']).oversized, ['a.ts']);
  assert.equal(run('select-files.mjs', { input: '[]', args: ['--max-file-diff-bytes', 'x'] }).code, 2);
});

test('--paths narrows the target and rescues generated files under it', () => {
  const result = select([rec('src/a.ts'), rec('lib/b.ts'), rec('src/dist/c.js')], ['--paths', 'src/']);
  assert.deepEqual(result.reviewable.map((f) => f.path), ['src/a.ts', 'src/dist/c.js']);
  assert.deepEqual(result.excluded, []);
});

test('--exclude lists the file as user_rule; prefixes stay case-sensitive', () => {
  assert.equal(reason(select([rec('src/a.ts')], ['--exclude', 'src/']), 'src/a.ts'), 'user_rule');
  assert.deepEqual(select([rec('src/a.ts')], ['--exclude', 'Src/']).reviewable.map((f) => f.path), ['src/a.ts']);
});

test('test files and markdown are reviewable', () => {
  const result = select([rec('src/a.test.ts'), rec('FooTest.java'), rec('test/ops.test.mjs'), rec('README.md')]);
  assert.ok(classes(result, 'src/a.test.ts').includes('test'));
  assert.ok(classes(result, 'FooTest.java').includes('test'));
  assert.ok(classes(result, 'test/ops.test.mjs').includes('test'));
  assert.deepEqual(classes(result, 'README.md'), ['docs']);
});

test('deleted files are reviewable; deleted code also gets contract', () => {
  const result = select([rec('src/legacy.ts', { status: 'D' })]);
  assert.equal(result.reviewable[0].status, 'D');
  assert.deepEqual(result.reviewable[0].classes, ['code', 'contract']);
});

test('a deleted file matching a generated glob is still excluded', () => {
  assert.equal(reason(select([rec('dist/Old.js', { status: 'D' })]), 'dist/Old.js'), 'generated');
});

test('globs: braces, ** across folders, case-insensitive names', () => {
  const result = select([
    rec('src/a.tsx'), rec('src/a.js'), rec('a/b/c/node_modules/x.js'), rec('Frontend/DIST/bundle.js'),
    rec('src/AuthService.java'), rec('src/LoginForm.tsx'), rec('src/TokenStore.go'), rec('README.MD'),
  ]);
  assert.deepEqual(classes(result, 'src/a.tsx'), ['code', 'ui']);
  assert.deepEqual(classes(result, 'src/a.js'), ['code']);
  assert.equal(reason(result, 'a/b/c/node_modules/x.js'), 'vendored');
  assert.equal(reason(result, 'Frontend/DIST/bundle.js'), 'generated');
  for (const p of ['src/AuthService.java', 'src/LoginForm.tsx', 'src/TokenStore.go']) assert.ok(classes(result, p).includes('security'), p);
  assert.deepEqual(classes(result, 'README.MD'), ['docs']);
});

test('a source folder named build is not treated as output', () => {
  const result = select([rec('skills/build/SKILL.md'), rec('build/out.js')]);
  assert.deepEqual(result.reviewable.map((f) => f.path), ['skills/build/SKILL.md']);
  assert.equal(reason(result, 'build/out.js'), 'generated');
});

test('class tags for data, i18n, workflows and api folders', () => {
  const result = select([rec('package.json'), rec('locales/fr.json'), rec('.github/workflows/ci.yml'), rec('src/api/user.ts')]);
  assert.deepEqual(classes(result, 'package.json'), ['data']);
  assert.deepEqual(classes(result, 'locales/fr.json'), ['data', 'i18n']);
  assert.ok(classes(result, '.github/workflows/ci.yml').includes('security'));
  assert.ok(classes(result, 'src/api/user.ts').includes('contract'));
});

test('content signals add security only when the diff carries one', () => {
  const sink = 'export function render(el, c) {\n  el.innerHTML = c;\n}\n';
  assert.ok(classes(select([rec('src/ui/widget.ts', { diff: sink })]), 'src/ui/widget.ts').includes('security'));
  assert.ok(!classes(select([rec('src/ui/widget.ts')]), 'src/ui/widget.ts').includes('security'));
  const benign = 'export function add(a, b) {\n  return a + b;\n}\n';
  assert.ok(!classes(select([rec('src/math/add.ts', { diff: benign })]), 'src/math/add.ts').includes('security'));
});

test('input order is preserved and output is deterministic', () => {
  const records = [rec('z.ts'), rec('a.java', { status: 'D' }), rec('m.py')];
  assert.deepEqual(select(records).reviewable.map((f) => f.path), ['z.ts', 'a.java', 'm.py']);
  assert.equal(run('select-files.mjs', { input: JSON.stringify(records) }).stdout, run('select-files.mjs', { input: JSON.stringify(records) }).stdout);
});

test('backslash paths are normalized', () => {
  assert.deepEqual(select([rec('src\\a.ts')]).reviewable.map((f) => f.path), ['src/a.ts']);
});

test('--explain reports the matching rules for one path', () => {
  const { json } = run('select-files.mjs', { args: ['--explain', '.env'] });
  assert.equal(json.secret, '**/.env');
});

test('malformed input exits 2', () => {
  assert.equal(run('select-files.mjs', { input: 'not json' }).code, 2);
  assert.equal(run('select-files.mjs', { input: JSON.stringify([{ status: 'M' }]) }).code, 2);
  assert.equal(run('select-files.mjs', { input: JSON.stringify({ path: 'a.ts' }) }).code, 2);
  assert.equal(run('select-files.mjs', { input: '[]', args: ['--bogus'] }).code, 2);
});
