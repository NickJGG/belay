import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { grillFile, grillPreview, grillStatus, isGrillSlug, loadGrillSession, loadGrillSessions, type GrillMemo } from '../sessions.ts';
import { splitFrontmatter } from '../../../store.ts';

let grillDir: string;

beforeEach(() => {
  grillDir = mkdtempSync(join(tmpdir(), 'belay-grill-'));
});

afterEach(() => rmSync(grillDir, { recursive: true, force: true }));

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
  assert.deepEqual(loadGrillSession(grillDir, 'page'), {
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
  assert.equal(loadGrillSession(grillDir, 'other')?.body, '# Notes\n\ntext');
});

test('loadGrillSession falls back to the whole text when the frontmatter is malformed or missing', () => {
  write('bad', '---\n: [\n---\nbody\n');
  write('bare', '# Grill session: bare\n\njust text\n');
  assert.deepEqual(loadGrillSession(grillDir, 'bad'), {
    slug: 'bad',
    topic: '',
    status: undefined,
    project: undefined,
    started: undefined,
    updated: undefined,
    body: '---\n: [\n---\nbody\n',
  });
  assert.equal(loadGrillSession(grillDir, 'bare')?.body, 'just text\n');
});

test('loadGrillSession rejects slugs that could leave the sessions dir, and missing files', () => {
  write('x', session);
  for (const s of ['../x', 'a/b', 'a\\b', 'A', '', '-x', 'x.md']) {
    assert.equal(isGrillSlug(s), false, s);
    assert.equal(loadGrillSession(grillDir, s), undefined, s);
  }
  assert.equal(loadGrillSession(grillDir, 'does-not-exist'), undefined);
});

test('loadGrillSessions still lists sessions without their bodies', () => {
  write('page', session);
  write('bad', '---\n: [\n---\n');
  assert.deepEqual(
    loadGrillSessions(grillDir).sort((a, b) => a.slug.localeCompare(b.slug)),
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
    loadGrillSessions(grillDir).sort((a, b) => a.slug.localeCompare(b.slug)),
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
    loadGrillSessions(grillDir).sort((a, b) => a.slug.localeCompare(b.slug)),
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
  assert.equal(loadGrillSessions(grillDir, memo).length, 2);

  write('page', session.replace('A session page', 'Renamed'));
  utimesSync(path, atime, mtime);
  rmSync(join(grillDir, 'gone'), { recursive: true });
  assert.deepEqual(loadGrillSessions(grillDir, memo).map((g) => g.topic), ['A session page']);
  assert.deepEqual([...memo.keys()], ['page']);

  utimesSync(path, atime, new Date(mtime.getTime() + 2000));
  assert.deepEqual(loadGrillSessions(grillDir, memo).map((g) => g.topic), ['Renamed']);
});

test('loadGrillSessions ignores flat files, folders without their session file, and non-slug folders', () => {
  write('page', session);
  writeFileSync(join(grillDir, 'flat.md'), session);
  mkdirSync(join(grillDir, 'empty'));
  writeFileSync(join(grillDir, 'empty', 'other.md'), session);
  mkdirSync(join(grillDir, 'Not_A_Slug'));
  writeFileSync(join(grillDir, 'Not_A_Slug', 'Not_A_Slug.md'), session);
  assert.deepEqual(loadGrillSessions(grillDir).map((g) => g.slug), ['page']);
  assert.deepEqual(loadGrillSessions(grillDir, new Map()).map((g) => g.slug), ['page']);
  assert.equal(loadGrillSession(grillDir, 'flat'), undefined);
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
    const got = loadGrillSession(grillDir, `v${i}`);
    assert.equal(got?.topic, data.topic == null ? '' : String(data.topic), v);
    assert.equal(got?.status, data.status == null ? undefined : String(data.status), v);
    assert.equal(loadGrillSessions(grillDir).find((g) => g.slug === `v${i}`)?.topic, got?.topic, v);
  }
});

test('loadGrillSession falls back to yaml for duplicate keys and multi-line values', () => {
  write('dup', '---\ntopic: one\ntopic: two\n---\n');
  write('multi', '---\ntopic: >\n  folded\n  text\nstatus: planned\n---\n');
  assert.equal(loadGrillSession(grillDir, 'dup')?.topic, '');
  assert.equal(loadGrillSession(grillDir, 'multi')?.topic, 'folded text\n');
});

test('grillFile and grillPreview sit in the slug folder, whether or not it exists', () => {
  assert.equal(grillFile(grillDir, 'page'), join(grillDir, 'page', 'page.md'));
  assert.equal(grillPreview(grillDir, 'page'), join(grillDir, 'page', 'preview.html'));
});

test("grillStatus reads session.json, or the session file's frontmatter for a legacy grill", () => {
  write('live', session.replace('status: planned', 'status: in-progress'));
  writeFileSync(join(grillDir, 'live', 'session.json'), JSON.stringify({ slug: 'live', status: 'planned' }));
  write('legacy', session);
  mkdirSync(join(grillDir, 'bare'));
  writeFileSync(join(grillDir, 'bare', 'session.json'), '{}');
  assert.equal(grillStatus(grillDir, 'live'), 'planned');
  assert.equal(grillStatus(grillDir, 'legacy'), 'planned');
  assert.equal(grillStatus(grillDir, 'bare'), undefined);
  assert.equal(grillStatus(grillDir, 'missing'), undefined);
});
