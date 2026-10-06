import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { grillDir, isGrillSlug, loadGrillSession, loadGrillSessions } from '../src/grill.ts';

let claude: string;

beforeEach(() => {
  claude = mkdtempSync(join(tmpdir(), 'belay-claude-'));
  mkdirSync(grillDir(claude), { recursive: true });
});

afterEach(() => rmSync(claude, { recursive: true, force: true }));

const write = (slug: string, text: string) => writeFileSync(join(grillDir(claude), `${slug}.md`), text);

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
  assert.deepEqual(loadGrillSession(claude, 'page'), {
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
  assert.equal(loadGrillSession(claude, 'other')?.body, '# Notes\n\ntext');
});

test('loadGrillSession falls back to the whole text when the frontmatter is malformed or missing', () => {
  write('bad', '---\n: [\n---\nbody\n');
  write('bare', '# Grill session: bare\n\njust text\n');
  assert.deepEqual(loadGrillSession(claude, 'bad'), {
    slug: 'bad',
    topic: '',
    status: undefined,
    project: undefined,
    started: undefined,
    updated: undefined,
    body: '---\n: [\n---\nbody\n',
  });
  assert.equal(loadGrillSession(claude, 'bare')?.body, 'just text\n');
});

test('loadGrillSession rejects slugs that could leave the sessions dir, and missing files', () => {
  write('x', session);
  for (const s of ['../x', 'a/b', 'a\\b', 'A', '', '-x', 'x.md']) {
    assert.equal(isGrillSlug(s), false, s);
    assert.equal(loadGrillSession(claude, s), undefined, s);
  }
  assert.equal(loadGrillSession(claude, 'does-not-exist'), undefined);
});

test('loadGrillSessions still lists sessions without their bodies', () => {
  write('page', session);
  write('bad', '---\n: [\n---\n');
  assert.deepEqual(
    loadGrillSessions(claude).sort((a, b) => a.slug.localeCompare(b.slug)),
    [
      { slug: 'bad', topic: '', status: undefined, updated: undefined, project: undefined },
      { slug: 'page', topic: 'A session page', status: 'planned', updated: '2026-10-06', project: 'BEL' },
    ],
  );
});
