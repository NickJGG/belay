import assert from 'node:assert/strict';
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { git, gitRepo, run, tempDir, writeFiles } from './helpers.mjs';

const pkg = (value) => JSON.stringify(value);
const discover = (dir, cwd) => {
  const res = run('discover.mjs', { args: dir ? ['--repo', dir] : [], cwd });
  assert.equal(res.code, 0, res.stderr);
  return res.json;
};
const workspace = (out, dir, manager) => out.workspaces.find((w) => w.dir === dir && (!manager || w.manager === manager));

test('a pnpm monorepo: root plus pnpm-workspace.yaml packages, scripts as commands', () => {
  const dir = gitRepo({
    'package.json': pkg({ name: 'root', scripts: { typecheck: 'tsc', test: 'node --test' } }),
    'pnpm-lock.yaml': '',
    'pnpm-workspace.yaml': "packages:\n  - 'web'\n  - \"extensions/*\"\n  - '!extensions/skip'\n# comment\nonlyBuiltDependencies:\n  - esbuild\n",
    'web/package.json': pkg({ scripts: { 'type-check': 'tsc', lint: 'eslint' } }),
    'extensions/grill/package.json': pkg({ name: 'grill' }),
    'extensions/skip/package.json': pkg({ name: 'skip' }),
    'extensions/notapkg/readme.md': 'x',
    'esbuild/package.json': pkg({}),
  });
  const out = discover(dir);
  assert.deepEqual(out.workspaces.map((w) => w.dir), ['.', 'extensions/grill', 'web']);
  assert.deepEqual(workspace(out, '.').scripts, { typecheck: 'pnpm run typecheck', lint: null, test: 'pnpm run test' });
  assert.deepEqual(workspace(out, 'web').scripts, { typecheck: 'pnpm run type-check', lint: 'pnpm run lint', test: null });
  assert.equal(workspace(out, 'web').manager, 'pnpm', 'the lockfile is found by walking up');
});

test('package.json workspaces (array and object forms) and npm/yarn/bun managers', () => {
  const npmRepo = gitRepo({
    'package.json': pkg({ workspaces: ['packages/*'], scripts: { test: 'echo "Error: no test specified" && exit 1' } }),
    'package-lock.json': '{}',
    'packages/a/package.json': pkg({ scripts: { test: 'vitest' } }),
  });
  const out = discover(npmRepo);
  assert.equal(workspace(out, '.').manager, 'npm');
  assert.equal(workspace(out, '.').scripts.test, null, "npm init's placeholder test script is not a test");
  assert.equal(workspace(out, 'packages/a').scripts.test, 'npm test');

  const yarnRepo = gitRepo({
    'package.json': pkg({ workspaces: { packages: ['apps/**'] } }),
    'yarn.lock': '',
    'apps/web/package.json': pkg({ scripts: { lint: 'eslint' } }),
    'apps/web/node_modules/dep/package.json': pkg({}),
  });
  const yarnOut = discover(yarnRepo);
  assert.deepEqual(yarnOut.workspaces.map((w) => w.dir), ['.', 'apps/web']);
  assert.equal(workspace(yarnOut, 'apps/web').scripts.lint, 'yarn lint');

  const bunRepo = gitRepo({ 'package.json': pkg({ scripts: { tsc: 'tsc' } }), 'bun.lock': '' });
  assert.deepEqual(workspace(discover(bunRepo), '.'), { dir: '.', manager: 'bun', scripts: { typecheck: 'bun run tsc', lint: null, test: null } });
});

test('packageManager decides when there is no lockfile; tsconfig gives a typecheck fallback', () => {
  const dir = gitRepo({ 'package.json': pkg({ packageManager: 'pnpm@9.0.0' }), 'tsconfig.json': '{}' });
  assert.deepEqual(workspace(discover(dir), '.'), { dir: '.', manager: 'pnpm', scripts: { typecheck: 'pnpm exec tsc --noEmit', lint: null, test: null } });
});

test('non-JS toolchains at the root', () => {
  const dir = gitRepo({ 'Cargo.toml': '[package]\n', 'go.mod': 'module x\n', 'pom.xml': '<project/>', 'App.sln': '', 'pyproject.toml': '[tool.pytest.ini_options]\n[tool.ruff]\n' });
  const out = discover(dir);
  assert.deepEqual(workspace(out, '.', 'cargo').scripts, { typecheck: 'cargo check', lint: 'cargo clippy', test: 'cargo test' });
  assert.equal(workspace(out, '.', 'go').scripts.test, 'go test ./...');
  assert.equal(workspace(out, '.', 'maven').scripts.test, 'mvn test');
  assert.equal(workspace(out, '.', 'dotnet').scripts.test, 'dotnet test');
  assert.equal(workspace(out, '.', 'python').scripts.test, 'pytest');
  assert.equal(workspace(out, '.', 'python').scripts.lint, 'ruff check .');
  assert.equal(out.workspaces.some((w) => w.manager === 'npm'), false);
});

test('an empty repo has no workspaces', () => {
  assert.deepEqual(discover(gitRepo({ 'notes.txt': 'x' })).workspaces, []);
});

test('root, default branch, languages, tools and rule files', () => {
  const dir = gitRepo({
    'src/a.ts': '', 'src/b.ts': '', 'src/c.tsx': '', 'lib/x.py': '', 'README.md': '', 'logo.png': '',
    'CLAUDE.md': '', 'web/AGENTS.md': '', 'web/CLAUDE.md': '', 'REVIEW.md': '',
  }, 'master');
  writeFiles(dir, { 'docs/CLAUDE.md': 'untracked but not ignored' });
  mkdirSync(join(dir, 'sub'));
  const out = discover(null, join(dir, 'sub'));
  assert.equal(out.root.toLowerCase(), dir.replace(/\\/g, '/').toLowerCase());
  assert.equal(out.defaultBranch, 'master');
  assert.deepEqual(Object.entries(out.languages), [['Markdown', 5], ['TypeScript', 3], ['Python', 1]]);
  assert.equal(out.tools.git, true);
  assert.equal(typeof out.tools.gh, 'boolean');
  assert.equal(typeof out.tools.codex, 'boolean');
  assert.deepEqual(out.ruleFiles, { review: 'REVIEW.md', claude: ['CLAUDE.md', 'docs/CLAUDE.md', 'web/AGENTS.md', 'web/CLAUDE.md'] });
});

test('origin/HEAD names the default branch over local ones', () => {
  const origin = gitRepo({ 'a.txt': 'x' }, 'trunk');
  const clone = tempDir();
  git(clone, 'clone', '-q', origin, 'c');
  assert.equal(discover(join(clone, 'c')).defaultBranch, 'trunk');
});

test('outside a git repo it still reports the folder', () => {
  const dir = tempDir();
  writeFiles(dir, { 'package.json': pkg({ scripts: { test: 'x' } }) });
  const out = discover(dir);
  assert.equal(out.defaultBranch, null);
  assert.equal(workspace(out, '.').scripts.test, 'npm test');
});

test('bad flags exit 2', () => {
  assert.equal(run('discover.mjs', { args: ['--nope'] }).code, 2);
});
