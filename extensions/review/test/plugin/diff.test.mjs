import assert from 'node:assert/strict';
import { test } from 'node:test';
import { addedText, isMechanical, parseUnifiedDiff, renderDiff, renderSnapshot, splitRendered } from '../../plugin/scripts/lib/diff.mjs';

const MODIFIED = `diff --git a/src/a.ts b/src/a.ts
index 111..222 100644
--- a/src/a.ts
+++ b/src/a.ts
@@ -10,3 +10,4 @@ function load() {
 keep
-old
+new
+more
 tail
`;

test('parses status, counts and hunks', () => {
  const [f] = parseUnifiedDiff(MODIFIED);
  assert.equal(f.path, 'src/a.ts');
  assert.equal(f.status, 'M');
  assert.deepEqual([f.insertions, f.deletions], [2, 1]);
  assert.equal(f.hunks[0].newStart, 10);
  assert.equal(f.hunks[0].context, 'function load() {');
  assert.equal(addedText(f), 'new\nmore');
});

test('content that looks like a diff header stays content', () => {
  const text = `diff --git a/x.md b/x.md
--- a/x.md
+++ b/x.md
@@ -1,2 +1,2 @@
-diff --git a/fake b/fake
+-- not a header
 tail
`;
  const files = parseUnifiedDiff(text);
  assert.equal(files.length, 1);
  assert.deepEqual([files[0].insertions, files[0].deletions], [1, 1]);
});

test('parses added, deleted, renamed and binary files', () => {
  const text = `diff --git a/n.ts b/n.ts
new file mode 100644
--- /dev/null
+++ b/n.ts
@@ -0,0 +1 @@
+a
diff --git a/d.ts b/d.ts
deleted file mode 100644
--- a/d.ts
+++ /dev/null
@@ -1 +0,0 @@
-a
diff --git a/old name.ts b/new name.ts
similarity index 100%
rename from old name.ts
rename to new name.ts
diff --git a/p.png b/p.png
index 1..2 100644
Binary files a/p.png and b/p.png differ
`;
  const [added, deleted, renamed, binary] = parseUnifiedDiff(text);
  assert.deepEqual([added.path, added.status], ['n.ts', 'A']);
  assert.deepEqual([deleted.path, deleted.status], ['d.ts', 'D']);
  assert.deepEqual([renamed.path, renamed.oldPath, renamed.status, renamed.similarity], ['new name.ts', 'old name.ts', 'R', 100]);
  assert.deepEqual([binary.path, binary.binary, binary.insertions], ['p.png', true, null]);
});

test('renders new-side numbers; a removed line has none, unless the file is deleted', () => {
  const rendered = renderDiff(parseUnifiedDiff(MODIFIED)[0]);
  assert.match(rendered, /^=== src\/a\.ts \(M, \+2 -1\) ===/);
  assert.match(rendered, /^\s+10  keep$/m);
  assert.match(rendered, /^ {7}-old$/m);
  assert.match(rendered, /^\s+11 \+new$/m);
  assert.match(rendered, /^\s+13  tail$/m);
  const deleted = parseUnifiedDiff(`diff --git a/d.ts b/d.ts
deleted file mode 100644
--- a/d.ts
+++ /dev/null
@@ -5,2 +0,0 @@
-a
-b
`)[0];
  assert.match(renderDiff(deleted), /^\s+6 -b$/m);
});

test('renderSnapshot numbers every line', () => {
  assert.equal(renderSnapshot('a.ts', 'one\ntwo\n'), '=== a.ts (2 lines) ===\n     1  one\n     2  two\n');
});

test('splitRendered keeps the header on each piece and prefers hunk boundaries', () => {
  const body = ['@@ one', ...Array(60).fill('x'.repeat(10)), '@@ two', ...Array(60).fill('y'.repeat(10))].join('\n');
  const pieces = splitRendered(`=== a.ts (M, +1 -0) ===\n${body}\n`, 1000);
  assert.ok(pieces.length >= 2);
  for (const [i, p] of pieces.entries()) assert.ok(p.startsWith(`=== a.ts (M, +1 -0), piece ${i + 1} of ${pieces.length} ===`));
  assert.ok(pieces.some((p) => p.split('\n')[1] === '@@ two'));
  assert.equal(splitRendered('=== a ===\nsmall\n', 1000).length, 1);
});

const diffOf = (removed, added) => parseUnifiedDiff(`diff --git a/a.ts b/a.ts
--- a/a.ts
+++ b/a.ts
@@ -1 +1 @@
-${removed}
+${added}
`)[0];

test('isMechanical accepts only a changed module specifier', () => {
  assert.equal(isMechanical(diffOf("import { a } from './x';", "import { a } from '../y/x';")), true);
  assert.equal(isMechanical(diffOf("} from './x';", "} from '../y/x';")), true);
  assert.equal(isMechanical(diffOf("export * from './x';", "export * from './y';")), true);
  assert.equal(isMechanical(diffOf("const a = require('./x');", "const a = require('./y');")), true);
  assert.equal(isMechanical(diffOf("import { a } from './x';", "import { b } from './x';")), false);
  assert.equal(isMechanical(diffOf("const a = 'x';", "const a = 'y';")), false);
  assert.equal(isMechanical(diffOf("import('./x');", "import('./y');")), false);
});
