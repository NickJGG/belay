import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { grillDirs, grillFile, grillPreview, isGrillSlug, loadGrillSession, loadGrillSessions, type GrillMemo, type GrillRoots } from '../src/grill.ts';
import { splitFrontmatter } from '../src/store.ts';

let tmp: string;
let roots: GrillRoots;
/** The old `/grill` archive, where most tests write. */
let grillDir: string;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'belay-grill-'));
  roots = { sear: join(tmp, 'sear'), claude: join(tmp, 'claude') };
  grillDir = grillDirs(roots)[1];
  mkdirSync(grillDir, { recursive: true });
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

const write = (slug: string, text: string, dir = grillDir) => {
  mkdirSync(join(dir, slug), { recursive: true });
  writeFileSync(join(dir, slug, `${slug}.md`), text);
};

const session = `---
slug: page
topic: A session page
status: planned
project: BEL
started: 2026-10-01
updated: 2026-10-06
---

# Grill session: page

## Topic
Show it.
`;

test('loadGrillSession reads the frontmatter and strips the heading from the body', () => {
  write('page', session);
  assert.deepEqual(loadGrillSession(roots, 'page'), {
    slug: 'page',
    topic: 'A session page',
    status: 'planned',
    project: 'BEL',
    started: '2026-10-01',
    updated: '2026-10-06',
    body: '## Topic\nShow it.',
  });
});

test('loadGrillSession keeps a body whose first heading is something else', () => {
  write('other', '---\ntopic: T\n---\n# Notes\n\ntext\n');
  assert.equal(loadGrillSession(roots, 'other')?.body, '# Notes\n\ntext');
});

test('loadGrillSession falls back to the whole text when the frontmatter is malformed or missing', () => {
  write('bad', '---\n: [\n---\nbody\n');
  write('bare', '# Grill session: bare\n\njust text\n');
  assert.deepEqual(loadGrillSession(roots, 'bad'), {
    slug: 'bad',
    topic: '',
    status: undefined,
    project: undefined,
    started: undefined,
    updated: undefined,
    body: '---\n: [\n---\nbody\n',
  });
  assert.equal(loadGrillSession(roots, 'bare')?.body, 'just text\n');
});

test('loadGrillSession rejects slugs that could leave the sessions dir, and missing files', () => {
  write('x', session);
  for (const s of ['../x', 'a/b', 'a\\b', 'A', '', '-x', 'x.md']) {
    assert.equal(isGrillSlug(s), false, s);
    assert.equal(loadGrillSession(roots, s), undefined, s);
  }
  assert.equal(loadGrillSession(roots, 'does-not-exist'), undefined);
});

test('loadGrillSessions still lists sessions without their bodies', () => {
  write('page', session);
  write('bad', '---\n: [\n---\n');
  assert.deepEqual(
    loadGrillSessions(roots).sort((a, b) => a.slug.localeCompare(b.slug)),
    [
      { slug: 'bad', topic: '', status: undefined, updated: undefined, project: undefined },
      { slug: 'page', topic: 'A session page', status: 'planned', updated: '2026-10-06', project: 'BEL' },
    ],
  );
});

test('loadGrillSessions reads frontmatter longer than a read chunk, whatever the body size', () => {
  const topic = 'é'.repeat(5000);
  write('long', `---\ntopic: ${topic}\nstatus: planned\nupdated: 2026-10-06\n---\n\n${'body line\n'.repeat(5000)}`);
  write('big', session + 'x'.repeat(100_000));
  assert.deepEqual(
    loadGrillSessions(roots).sort((a, b) => a.slug.localeCompare(b.slug)),
    [
      { slug: 'big', topic: 'A session page', status: 'planned', updated: '2026-10-06', project: 'BEL' },
      { slug: 'long', topic, status: 'planned', updated: '2026-10-06', project: undefined },
    ],
  );
});

test('loadGrillSessions lists sessions without frontmatter, or with an unclosed block, by slug', () => {
  write('bare', '# Grill session: bare\n\n' + 'text\n'.repeat(2000));
  write('open', '---\ntopic: T\n' + 'more\n'.repeat(2000));
  const empty = { topic: '', status: undefined, updated: undefined, project: undefined };
  assert.deepEqual(
    loadGrillSessions(roots).sort((a, b) => a.slug.localeCompare(b.slug)),
    [{ slug: 'bare', ...empty }, { slug: 'open', ...empty }],
  );
});

test("loadGrillSessions reuses memoized sessions until the session file's mtime changes, and drops deleted folders", () => {
  const path = join(grillDir, 'page', 'page.md');
  write('page', session);
  write('gone', session);
  // whole seconds: a Date can't restore NTFS's sub-millisecond mtime
  const atime = new Date('2026-10-01T00:00:00Z');
  const mtime = new Date('2026-10-02T00:00:00Z');
  utimesSync(path, atime, mtime);
  const memo: GrillMemo = new Map();
  assert.equal(loadGrillSessions(roots, memo).length, 2);

  write('page', session.replace('A session page', 'Renamed'));
  utimesSync(path, atime, mtime);
  rmSync(join(grillDir, 'gone'), { recursive: true });
  assert.deepEqual(loadGrillSessions(roots, memo).map((g) => g.topic), ['A session page']);
  assert.deepEqual([...memo.keys()], ['page']);

  utimesSync(path, atime, new Date(mtime.getTime() + 2000));
  assert.deepEqual(loadGrillSessions(roots, memo).map((g) => g.topic), ['Renamed']);
});

test('loadGrillSessions ignores flat files, folders without their session file, and non-slug folders', () => {
  write('page', session);
  writeFileSync(join(grillDir, 'flat.md'), session);
  mkdirSync(join(grillDir, 'empty'));
  writeFileSync(join(grillDir, 'empty', 'other.md'), session);
  mkdirSync(join(grillDir, 'Not_A_Slug'));
  writeFileSync(join(grillDir, 'Not_A_Slug', 'Not_A_Slug.md'), session);
  assert.deepEqual(loadGrillSessions(roots).map((g) => g.slug), ['page']);
  assert.deepEqual(loadGrillSessions(roots, new Map()).map((g) => g.slug), ['page']);
  assert.equal(loadGrillSession(roots, 'flat'), undefined);
});

test('loadGrillSession reads frontmatter exactly as yaml does, plain or not', () => {
  const values = [
    'Plain words, with (punctuation) and C#/.NET',
    '"Quoted" then more',
    "'single'",
    'a P0 #3 comment',
    'key: inside',
    'trailing colon:',
    '2026-10-07',
    '3 things',
    '42',
    '-1.5',
    '.inf',
    'true',
    'False',
    'null',
    '~',
    'yes',
    '[a, b]',
    '- item',
    '*alias',
    'spaces after   ',
  ];
  for (const [i, v] of values.entries()) {
    const text = `---\ntopic: ${v}\nstatus: planned\n---\n\nbody\n`;
    write(`v${i}`, text);
    let data: Record<string, unknown> = {};
    try {
      ({ data } = splitFrontmatter(text, 'x'));
    } catch {}
    const got = loadGrillSession(roots, `v${i}`);
    assert.equal(got?.topic, data.topic == null ? '' : String(data.topic), v);
    assert.equal(got?.status, data.status == null ? undefined : String(data.status), v);
    assert.equal(loadGrillSessions(roots).find((g) => g.slug === `v${i}`)?.topic, got?.topic, v);
  }
});

test('loadGrillSession falls back to yaml for duplicate keys and multi-line values', () => {
  write('dup', '---\ntopic: one\ntopic: two\n---\n');
  write('multi', '---\ntopic: >\n  folded\n  text\nstatus: planned\n---\n');
  assert.equal(loadGrillSession(roots, 'dup')?.topic, '');
  assert.equal(loadGrillSession(roots, 'multi')?.topic, 'folded text\n');
});

test('sessions in both folders are listed, Sear first, and Sear wins on a slug in both', () => {
  write('old', session);
  write('both', session);
  write('both', session.replace('A session page', 'From Sear'), roots.sear);
  write('new', session, roots.sear);
  assert.deepEqual(
    loadGrillSessions(roots).map((g) => [g.slug, g.topic]),
    [
      ['both', 'From Sear'],
      ['new', 'A session page'],
      ['old', 'A session page'],
    ],
  );
  assert.equal(loadGrillSession(roots, 'both')?.topic, 'From Sear');
  assert.equal(grillFile(roots, 'both'), join(roots.sear, 'both', 'both.md'));
  assert.equal(grillPreview(roots, 'old'), join(grillDir, 'old', 'preview.html'));
  assert.equal(grillFile(roots, 'missing'), join(roots.sear, 'missing', 'missing.md'));
});

test('a memoized session is re-read when its slug moves to the other folder, even at the same mtime', () => {
  write('page', session);
  const mtime = new Date('2026-10-02T00:00:00Z');
  utimesSync(join(grillDir, 'page', 'page.md'), mtime, mtime);
  const memo: GrillMemo = new Map();
  assert.deepEqual(loadGrillSessions(roots, memo).map((g) => g.topic), ['A session page']);

  write('page', session.replace('A session page', 'From Sear'), roots.sear);
  utimesSync(join(roots.sear, 'page', 'page.md'), mtime, mtime);
  assert.deepEqual(loadGrillSessions(roots, memo).map((g) => g.topic), ['From Sear']);

  rmSync(join(roots.sear, 'page'), { recursive: true });
  assert.deepEqual(loadGrillSessions(roots, memo).map((g) => g.topic), ['A session page']);
});
