import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { git, gitRepo, run, tempDir, writeFiles } from './helpers.mjs';

function plan(repo, ...args) {
  const out = tempDir();
  const res = run('plan.mjs', { args: ['--repo', repo, '--out', out, ...args] });
  assert.equal(res.code, 0, res.stderr);
  return { out, ...res.json, full: JSON.parse(readFileSync(join(out, 'plan.json'), 'utf8')) };
}

const ids = (p) => p.spawns.map((s) => s.id);
const lines = (n, line = 'const x = 1;') => Array.from({ length: n }, (_, i) => `${line} // ${i}`).join('\n') + '\n';

test('a small code change gets one pass from each relevant reviewer', () => {
  const repo = gitRepo({ 'src/a.ts': 'export const a = 1;\n' });
  writeFiles(repo, { 'src/a.ts': 'export const a = 2;\n' });
  const p = plan(repo, '--uncommitted', '--seed', '1');
  assert.equal(p.tier, 'small');
  assert.equal(p.ask, false);
  assert.deepEqual(ids(p), ['02-bugs-security.p1.c1', '07-performance.p1.c1', '08-test-quality.p1.c1', 'quality.p1.c1']);
  assert.deepEqual(p.spawns.find((s) => s.id.startsWith('quality')).personas, ['quality.md', '01-standards.md', '03-dry-smells.md', '04-consistency-history.md', '05-simplification.md']);
  assert.deepEqual(p.spawns.find((s) => s.id.startsWith('02')).personas, ['02-bugs-security.md']);
});

test('a medium change gives bug reviewers a second pass on logic files only', () => {
  const repo = gitRepo({ 'src/a.ts': 'x\n', 'config.yaml': 'a: 1\n' });
  writeFiles(repo, { 'src/a.ts': lines(600), 'config.yaml': 'a: 2\n' });
  const p = plan(repo, '--uncommitted', '--seed', '1');
  assert.equal(p.tier, 'medium');
  const byId = Object.fromEntries(p.full.spawns.map((s) => [s.id, s]));
  assert.deepEqual([...byId['02-bugs-security.p1.c1'].files].sort(), ['config.yaml', 'src/a.ts']);
  assert.deepEqual(byId['02-bugs-security.p2.c1'].files, ['src/a.ts']);
  assert.ok(!byId['quality.p2.c1']);
});

test('--passes and --quality and --effort shape an A/B arm', () => {
  const repo = gitRepo({ 'src/a.ts': 'x\n' });
  writeFiles(repo, { 'src/a.ts': lines(600) });
  const p = plan(repo, '--uncommitted', '--passes', '1', '--quality', 'split', '--effort', 'xhigh');
  assert.ok(!ids(p).some((id) => id.includes('.p2.')));
  assert.ok(ids(p).includes('01-standards.p1.c1'));
  assert.ok(!ids(p).some((id) => id.startsWith('quality')));
  assert.equal(p.spawns[0].effort, 'xhigh');
});

test('a large change asks first', () => {
  const repo = gitRepo({ 'src/a.ts': 'x\n' });
  writeFiles(repo, { 'src/a.ts': lines(5200) });
  const p = plan(repo, '--uncommitted');
  assert.equal(p.tier, 'large');
  assert.equal(p.ask, true);
});

test('parts cite source lines, not positions in the part', () => {
  const repo = gitRepo({ 'a.ts': lines(50) });
  const after = readFileSync(join(repo, 'a.ts'), 'utf8').replace('const x = 1; // 39', 'const y = 2; // 39');
  writeFileSync(join(repo, 'a.ts'), after);
  const p = plan(repo, '--uncommitted');
  const prompt = readFileSync(p.spawns[0].prompt, 'utf8');
  const part = /<parts>\n(.*)\n<\/parts>/s.exec(prompt)[1];
  const text = readFileSync(part, 'utf8');
  assert.match(text, /^\s+40 \+const y = 2; \/\/ 39$/m);
  assert.match(text, /^\s+-const x = 1; \/\/ 39$/m);
  assert.match(prompt, /<assigned_files>\na\.ts\n<\/assigned_files>/);
});

test('exact moves and import-only edits collapse into mechanical.md', () => {
  const repo = gitRepo({ 'lib/keep.ts': 'k\n', 'src/old.ts': lines(30), 'src/user.ts': "import { x } from '../lib/old';\nexport const y = x;\n", 'src/real.ts': 'export const r = 1;\n' });
  git(repo, 'mv', 'src/old.ts', 'lib/moved.ts');
  writeFiles(repo, { 'src/user.ts': "import { x } from '../lib/moved';\nexport const y = x;\n", 'src/real.ts': 'export const r = 2;\n' });
  const p = plan(repo, '--uncommitted');
  assert.deepEqual(p.full.mechanical.sort(), ['lib/moved.ts', 'src/user.ts']);
  assert.equal(p.preview.files, 1);
  assert.equal(p.preview.mechanical, 2);
  const summary = readFileSync(join(p.out, 'mechanical.md'), 'utf8');
  assert.match(summary, /src\/old\.ts -> lib\/moved\.ts/);
  assert.match(summary, /-import \{ x \} from '\.\.\/lib\/old';/);
  assert.deepEqual(p.full.spawns.flatMap((s) => s.files).filter((f) => f !== 'src/real.ts'), []);
  const quality = readFileSync(p.spawns.find((s) => s.id.startsWith('quality')).prompt, 'utf8');
  assert.match(quality, /<mechanical>.*mechanical\.md<\/mechanical>/);
  const bugs = readFileSync(p.spawns.find((s) => s.id.startsWith('02')).prompt, 'utf8');
  assert.doesNotMatch(bugs, /<mechanical>/);
});

test('a change of only moves still spawns the quality reviewer on the summary', () => {
  const repo = gitRepo({ 'a.ts': lines(30) });
  git(repo, 'mv', 'a.ts', 'b.ts');
  const p = plan(repo, '--uncommitted');
  assert.deepEqual(ids(p), ['quality.p1.c1']);
  assert.match(readFileSync(p.spawns[0].prompt, 'utf8'), /<mechanical>/);
});

test('changing what an import brings in is not mechanical', () => {
  const repo = gitRepo({ 'a.ts': "import { x } from './b';\nexport const y = x;\n" });
  writeFiles(repo, { 'a.ts': "import { z } from './b';\nexport const y = z;\n" });
  assert.deepEqual(plan(repo, '--uncommitted').full.mechanical, []);
});

test('a dynamic import is not mechanical: nothing checks it', () => {
  const repo = gitRepo({ 'a.ts': "const m = await import('./old');\n" });
  writeFiles(repo, { 'a.ts': "const m = await import('./new');\n" });
  assert.deepEqual(plan(repo, '--uncommitted').full.mechanical, []);
});

test('secrets become findings by name and their contents reach no packet file', () => {
  const repo = gitRepo({ 'a.ts': 'x\n' });
  writeFiles(repo, { '.env': 'TOKEN=supersecretvalue\n', 'a.ts': 'y\n' });
  const p = plan(repo, '--uncommitted');
  assert.deepEqual(p.secrets, ['.env']);
  const findings = JSON.parse(readFileSync(join(p.out, 'returns', 'secrets.json'), 'utf8'));
  assert.equal(findings[0].severity, 'CRITICAL');
  assert.equal(findings[0].confidence, 'VERIFIED');
  const everything = p.full.spawns.flatMap((s) => [readFileSync(s.prompt, 'utf8')]).join('');
  assert.doesNotMatch(everything, /supersecretvalue/);
  assert.equal(existsSync(join(p.out, 'hunks', '.env.diff')), false);
});

test('untracked files are in an uncommitted review; binaries are excluded', () => {
  const repo = gitRepo({ 'a.ts': 'x\n' });
  writeFiles(repo, { 'new.ts': 'export const n = 1;\n' });
  writeFileSync(join(repo, 'blob.dat'), Buffer.from([1, 0, 2]));
  const p = plan(repo, '--uncommitted');
  assert.ok(p.full.spawns[0].files.includes('new.ts'));
  assert.deepEqual(p.excluded, [{ path: 'blob.dat', reason: 'binary' }]);
});

test('--range, --staged and --diff-file all plan the same kind of packet', () => {
  const repo = gitRepo({ 'a.ts': 'one\n' });
  writeFiles(repo, { 'a.ts': 'two\n' });
  git(repo, 'add', '-A');
  assert.deepEqual(plan(repo, '--staged').full.spawns[0].files, ['a.ts']);
  const patch = join(tempDir(), 'pr.diff');
  writeFileSync(patch, git(repo, 'diff', '--cached'));
  assert.deepEqual(plan(repo, '--diff-file', patch).full.spawns[0].files, ['a.ts']);
  git(repo, 'commit', '-q', '-m', 'two');
  assert.deepEqual(plan(repo, '--range', 'HEAD~1..HEAD').full.spawns[0].files, ['a.ts']);
});

test('--paths narrows the change; a path no change touches plans nothing', () => {
  const repo = gitRepo({ 'a.ts': 'x\n', 'b.ts': 'x\n' });
  writeFiles(repo, { 'a.ts': 'y\n', 'b.ts': 'y\n' });
  assert.deepEqual(plan(repo, '--uncommitted', '--paths', 'a.ts').full.spawns[0].files, ['a.ts']);
  assert.equal(plan(repo, '--uncommitted', '--paths', 'nowhere/').empty, true);
});

test('an empty change plans nothing', () => {
  const p = plan(gitRepo({ 'a.ts': 'x\n' }), '--uncommitted');
  assert.equal(p.empty, true);
  assert.deepEqual(p.spawns, []);
});

test('a snapshot reviews a single file as it stands, with its own line numbers', () => {
  const repo = gitRepo({ 'src/a.ts': lines(3), 'src/b.ts': lines(3) });
  const p = plan(repo, '--snapshot', '--paths', 'src/a.ts');
  assert.equal(p.mode, 'snapshot');
  assert.equal(p.tier, 'small');
  assert.deepEqual(p.full.spawns[0].files, ['src/a.ts']);
  const prompt = readFileSync(p.spawns[0].prompt, 'utf8');
  assert.match(prompt, /<mode>snapshot<\/mode>/);
  const text = readFileSync(/<parts>\n(.*)\n<\/parts>/s.exec(prompt)[1], 'utf8');
  assert.match(text, /^\s+2  const x = 1; \/\/ 1$/m);
});

test('a snapshot of a big folder is large and asks first', () => {
  const repo = gitRepo(Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`src/f${i}.ts`, lines(400)])));
  const p = plan(repo, '--snapshot');
  assert.equal(p.tier, 'large');
  assert.equal(p.ask, true);
});

test('chunks follow size, not file count: many tiny files stay in one chunk', () => {
  const repo = gitRepo(Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`src/f${i}.ts`, 'x\n'])));
  writeFiles(repo, Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`src/f${i}.ts`, 'y\n'])));
  const bugs = plan(repo, '--uncommitted').spawns.filter((s) => s.id.startsWith('02'));
  assert.equal(bugs.length, 1);
});

test('files that import each other land in the same chunk', () => {
  const big = lines(2000);
  const repo = gitRepo({ 'a/one.ts': 'x\n', 'b/two.ts': 'x\n', 'c/three.ts': 'x\n', 'd/four.ts': 'x\n' });
  writeFiles(repo, {
    'a/one.ts': `import { t } from '../d/four';\n${big}`,
    'b/two.ts': big,
    'c/three.ts': big,
    'd/four.ts': big,
  });
  const p = plan(repo, '--uncommitted', '--seed', '3', '--tier', 'small');
  for (const s of p.full.spawns.filter((x) => x.id.startsWith('02'))) {
    assert.equal(s.files.includes('a/one.ts'), s.files.includes('d/four.ts'), s.id);
  }
});

test('the same seed replays the plan; the two passes differ in order or boundaries', () => {
  const big = lines(1500);
  const names = Array.from({ length: 12 }, (_, i) => `m${i}/f.ts`);
  const repo = gitRepo(Object.fromEntries(names.map((n) => [n, 'x\n'])));
  writeFiles(repo, Object.fromEntries(names.map((n) => [n, big])));
  const a = plan(repo, '--uncommitted', '--seed', '9').full.spawns;
  const b = plan(repo, '--uncommitted', '--seed', '9').full.spawns;
  assert.deepEqual(a.map((s) => [s.id, s.files]), b.map((s) => [s.id, s.files]));
  const pass = (n) => a.filter((s) => s.id.startsWith(`02-bugs-security.p${n}`)).map((s) => s.files);
  assert.notDeepEqual(pass(1), pass(2));
  assert.deepEqual(pass(1).flat().sort(), pass(2).flat().sort());
});

test('budgets scale with the slice', () => {
  const small = gitRepo({ 'a.ts': 'x\n' });
  writeFiles(small, { 'a.ts': 'y\n' });
  const large = gitRepo({ 'a.ts': 'x\n' });
  writeFiles(large, { 'a.ts': lines(1000) });
  const budget = (p) => p.full.spawns.find((s) => s.id.startsWith('02')).budget;
  assert.ok(budget(plan(small, '--uncommitted')) < budget(plan(large, '--uncommitted')));
});

test('bad arguments exit 2', () => {
  const repo = gitRepo({ 'a.ts': 'x\n' });
  const out = tempDir();
  assert.equal(run('plan.mjs', { args: ['--repo', repo, '--uncommitted'] }).code, 2);
  assert.equal(run('plan.mjs', { args: ['--repo', repo, '--out', out] }).code, 2);
  assert.equal(run('plan.mjs', { args: ['--repo', repo, '--out', out, '--staged', '--unstaged'] }).code, 2);
  assert.equal(run('plan.mjs', { args: ['--repo', repo, '--out', out, '--uncommitted', '--tier', 'huge'] }).code, 2);
  assert.equal(run('plan.mjs', { args: ['--repo', tempDir(), '--out', out, '--uncommitted'] }).code, 2);
});
