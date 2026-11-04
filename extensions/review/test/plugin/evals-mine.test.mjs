import assert from 'node:assert/strict';
import fs from 'node:fs';
import { test } from 'node:test';
import { looksLikeBugFix, mine, removedRanges } from '../evals/mine.mjs';
import { materialize } from '../evals/materialize.mjs';
import { git, gitRepo, writeFiles } from './helpers.mjs';

test('looksLikeBugFix wants a fix and rejects housekeeping', () => {
  assert.equal(looksLikeBugFix('fix crash when profile is null'), true);
  assert.equal(looksLikeBugFix('Fixes the race in saver'), true);
  assert.equal(looksLikeBugFix("drawer: a turn's steps entry no longer closes the choice"), true);
  assert.equal(looksLikeBugFix("chat: let the textarea shrink so a narrow panel doesn't overflow"), true);
  assert.equal(looksLikeBugFix('fix typo in readme'), false);
  assert.equal(looksLikeBugFix('fix flaky test'), false);
  assert.equal(looksLikeBugFix('add dark mode'), false);
});

test('removedRanges skips tests, non-code and pure additions', () => {
  const diff = `--- a/src/a.ts
+++ b/src/a.ts
@@ -10,2 +10 @@ ctx
--- a/test/a.test.ts
+++ b/test/a.test.ts
@@ -1 +1 @@
--- a/README.md
+++ b/README.md
@@ -1 +1 @@
--- a/src/b.ts
+++ b/src/b.ts
@@ -5,0 +6 @@
`;
  assert.deepEqual(removedRanges(diff), [{ file: 'src/a.ts', start: 10, count: 2 }]);
});

function repoWithBug() {
  const repo = gitRepo({ 'src/a.ts': 'export const a = 1;\nexport const b = 2;\n' });
  writeFiles(repo, { 'src/a.ts': 'export const a = 1;\nexport const b = 2;\nexport const add = (x, y) => x - y;\n' });
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'add adder');
  const introducing = git(repo, 'rev-parse', 'HEAD').trim();
  writeFiles(repo, { 'src/a.ts': 'export const a = 1;\nexport const b = 2;\nexport const add = (x, y) => x + y;\n' });
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'fix wrong sign in adder');
  return { repo, introducing, fix: git(repo, 'rev-parse', 'HEAD').trim() };
}

test('mine traces a fix back to the commit that introduced the bug', () => {
  const { repo, introducing, fix } = repoWithBug();
  const { candidates } = mine(repo);
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].fix, fix);
  assert.equal(candidates[0].introducing, introducing);
  assert.equal(candidates[0].introducingSubject, 'add adder');
  assert.deepEqual(candidates[0].files, ['src/a.ts']);
});

test('a bug blamed on the root commit is no case: there is nothing to diff against', () => {
  const repo = gitRepo({ 'a.ts': 'const a = 1;\n' });
  writeFiles(repo, { 'a.ts': 'const a = 2;\n' });
  git(repo, 'add', '-A');
  git(repo, 'commit', '-q', '-m', 'fix wrong value');
  assert.deepEqual(mine(repo).candidates, []);
});

test('--max-lines drops a commit too big to be a review anyone runs', () => {
  const { repo } = repoWithBug();
  assert.deepEqual(mine(repo, { maxLines: 0 }).candidates, []);
});

test('a real-commit fixture is the introducing commit as a staged change on its parent', () => {
  const { repo, introducing } = repoWithBug();
  const out = materialize({ fixture: { kind: 'real-commit', repo, commit: introducing } });
  try {
    assert.match(git(out, 'diff', '--cached'), /\+export const add = \(x, y\) => x - y;/);
    assert.doesNotMatch(fs.readFileSync(`${out}/src/a.ts`, 'utf8'), /x \+ y/);
    assert.match(git(out, 'log', '-1', '--format=%s'), /init/);
  } finally {
    fs.rmSync(out, { recursive: true, force: true });
  }
});
