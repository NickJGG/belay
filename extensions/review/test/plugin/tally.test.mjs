import assert from 'node:assert/strict';
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { run, tempDir } from './helpers.mjs';

const COUNTS = { critical: 2, important: 3, debt: 1, suggested: 0, question: 4, unverified: 1, plausible: 2 };
const COMMENT = `<!-- review-tally: ${JSON.stringify(COUNTS)} -->`;

// Shaped like references/report.md.
const REPORT = `# Change review: working tree

> **Verdict:** 3 must-fix: 1 🔴, 2 🟠 · 5 more below

## Checks
| Check | Result | Command · exit · time |
| typecheck | 🔴 FAIL(1) | pnpm typecheck · 1 · 4s |

## 🔴 Critical
**#1** load() throws when user.profile is missing \`[🔴 CRITICAL · HIGH]\` — src/a.ts:42
Impact: a 500.

## 🟠 Important
**#2** race on save \`[🟠 IMPORTANT · VERIFIED]\` — src/b.ts:3
**#3** leak \`[🟠 IMPORTANT · HIGH]\` — src/c.ts:9

## 🔬 Unverified: needs an observation
**#4** slow query \`[🟠 IMPORTANT · MEDIUM]\` — src/d.ts:1
To settle: run it.

## Quality
### 🟡 Debt
#### 03-dry-smells
**#5** src/lib/date.ts:30 — duplicates formatDay() (03-dry-smells)
### 🔵 Suggested
**#6** src/x.ts:1 — rename (01-standards)
**#7** src/y.ts:1 — rename (01-standards)
### ⚪ Questions
**#8** src/z.ts:1 — intended? (04-consistency-history)

## Plausible (not proven, not disproved)
**#9** src/p.ts:1 — maybe (02-bugs-security)

## Already there (older problems, not from this change)
**#10** src/old.ts:1 — old bug (02-bugs-security)

## Refuted (checked and set aside)
**#11** src/api.ts:40 — "unvalidated body" — refuted: validateBody() runs first

## Scope
Reviewed 9 files · Seed: 42
`;

const tally = (text, args = []) => run('tally.mjs', { input: text, args });

test('the tally comment is preferred and labelled', () => {
  const { code, json } = tally(`${REPORT}\n${COMMENT}\n`, ['--source']);
  assert.equal(code, 0);
  assert.deepEqual(json, { ...COUNTS, source: 'comment' });
});

test('without --source the output is exactly the counts', () => {
  assert.deepEqual(tally(COMMENT).json, COUNTS);
});

test('the last comment wins when a report quotes the template', () => {
  const earlier = '<!-- review-tally: {"critical":9,"important":9,"debt":9,"suggested":9,"question":9,"unverified":9,"plausible":9} -->';
  assert.deepEqual(tally(`${earlier}\n...\n${COMMENT}`).json, COUNTS);
});

test('an all-zero tally is recovered, not treated as missing', () => {
  const zero = '<!-- review-tally: {"critical":0,"important":0,"debt":0,"suggested":0,"question":0,"unverified":0,"plausible":0} -->';
  const { code, json } = tally(zero, ['--source']);
  assert.equal(code, 0);
  assert.equal(json.source, 'comment');
  assert.equal(json.critical, 0);
});

test('missing keys in the comment count as zero', () => {
  assert.deepEqual(tally('<!-- review-tally: {"critical":1} -->').json, { ...Object.fromEntries(Object.keys(COUNTS).map((k) => [k, 0])), critical: 1 });
});

test('sections are counted when the comment is missing', () => {
  const { code, json } = tally(REPORT, ['--source']);
  assert.equal(code, 0);
  assert.deepEqual(json, { critical: 1, important: 2, debt: 1, suggested: 2, question: 1, unverified: 1, plausible: 1, source: 'sections' });
});

test('a malformed comment falls through to the sections', () => {
  assert.equal(tally(`${REPORT}\n<!-- review-tally: {not json} -->`, ['--source']).json.source, 'sections');
});

test('a tagged finding in an untiered section counts by its tag', () => {
  const text = '## 🔴 Critical\nNone.\n\n## Quality\n**#1** dup `[🟡 DEBT · HIGH]` — a.ts:1\n**#2** untagged — b.ts:1\n';
  assert.deepEqual(tally(text).json, { critical: 0, important: 0, debt: 1, suggested: 0, question: 0, unverified: 0, plausible: 0 });
});

test('list-style reports without #N markers count top-level items', () => {
  const text = `## 🔴 Critical
- **Finding 1**: SQL injection — a.js:1
  - **Impact**: bad
- **Finding 2**: path traversal — b.js:2

## 🟡 Debt
- None found.

## Potential Issues (Plausible)
- **Finding 3**: maybe — g.js:7
`;
  assert.deepEqual(tally(text).json, { critical: 2, important: 0, debt: 0, suggested: 0, question: 0, unverified: 0, plausible: 1 });
});

test('a report reads from a file argument', () => {
  const file = join(tempDir(), 'report.md');
  writeFileSync(file, COMMENT);
  assert.deepEqual(run('tally.mjs', { args: [file] }).json, COUNTS);
});

test('an unrecoverable report exits 1', () => {
  const { code, stderr } = tally('# Report\n\nNothing structured here.\n');
  assert.equal(code, 1);
  assert.match(stderr, /no tally recoverable/);
});

test('bad usage exits 2', () => {
  assert.equal(run('tally.mjs', { args: ['a', 'b'] }).code, 2);
  assert.equal(run('tally.mjs', { args: [join(tempDir(), 'missing.md')] }).code, 2);
});
