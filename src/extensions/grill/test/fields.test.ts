import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { owned, type OwnedField } from '../../../extensions.ts';
import { Ctx, addComment, addIssue, editIssue, replaceBody, setPriority, setStatus } from '../../../ops.ts';
import { KNOWN_ISSUE_KEYS, loadIssues, parseIssue, serializeIssue, unknownKeys } from '../../../store.ts';
import { manifest } from '../manifest.ts';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'belay-'));
  mkdirSync(join(dir, 'projects'));
  mkdirSync(join(dir, 'issues'));
  writeFileSync(join(dir, 'projects', 'pix.md'), '---\nkey: PIX\nname: Pixel\npaths: []\nstatus: active\nfocus: false\n---\n');
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

const [grill, plan] = manifest.fields as [OwnedField, OwnedField];

/** PIX-1 in canonical form, with `mid` between `source` and `created`. */
const file = (mid = 'grill: some-slug\nplan: C:/plans/x.md\n', id = 'PIX-1') =>
  `---\nid: ${id}\ntitle: Do the thing\nproject: PIX\nstatus: todo\nblocked_by: []\nsource: user\n${mid}created: 2026-10-01\nupdated: 2026-10-01T09:00\n---\n`;

const path = (id = 'pix-1') => join(dir, 'issues', `${id}.md`);
const read = (id?: string) => readFileSync(path(id), 'utf8');

function belay(...args: string[]) {
  const env = {
    ...process.env,
    BELAY_DATA: dir,
    CLAUDECODE: '',
    GIT_AUTHOR_NAME: 'Test',
    GIT_AUTHOR_EMAIL: 'test@example.com',
    GIT_COMMITTER_NAME: 'Test',
    GIT_COMMITTER_EMAIL: 'test@example.com',
  };
  const r = spawnSync(process.execPath, ['src/cli.ts', ...args], { env, encoding: 'utf8' });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('grill and plan are owned fields, after source', () => {
  assert.deepEqual(manifest.fields, [
    { key: 'grill', after: 'source' },
    { key: 'plan', after: 'grill' },
  ]);
  assert.ok(KNOWN_ISSUE_KEYS.includes('grill') && KNOWN_ISSUE_KEYS.includes('plan'));
});

test('an issue with grill and plan parses them into extra and re-saves byte for byte', () => {
  const t = parseIssue(file(), 'f');
  assert.deepEqual(t.extra, [
    { key: 'grill', value: 'some-slug', after: 'source' },
    { key: 'plan', value: 'C:/plans/x.md', after: 'grill' },
  ]);
  assert.deepEqual(owned(t, 'grill'), { grill: 'some-slug', plan: 'C:/plans/x.md' });
  assert.deepEqual(owned(t, 'learn'), {});
  assert.deepEqual(unknownKeys(t, KNOWN_ISSUE_KEYS), []);
  assert.equal(serializeIssue(t), file());
  assert.equal(serializeIssue(JSON.parse(JSON.stringify(t))), file());
  assert.equal(serializeIssue(parseIssue(file('plan: p.md\n'), 'f')), file('plan: p.md\n'));
});

test('unknown keys beside the owned fields keep their places', () => {
  for (const mid of ['note: a\ngrill: g\nplan: p\n', 'grill: g\nnote: a\nplan: p\n', 'grill: g\nplan: p\nnote: a\n', 'note: a\nplan: p\n']) {
    assert.equal(serializeIssue(parseIssue(file(mid), 'f')), file(mid), mid);
  }
});

test('an owned field out of its slot moves into it on save, values equal, and stays', () => {
  const src = file('').replace('id: PIX-1\n', 'plan: p\nid: PIX-1\n').replace('updated: 2026-10-01T09:00\n', 'updated: 2026-10-01T09:00\ngrill: g\n');
  const once = serializeIssue(parseIssue(src, 'f'));
  assert.equal(once, file('grill: g\nplan: p\n'));
  assert.equal(serializeIssue(parseIssue(once, 'f')), once);
});

test('invalid owned values make the file bad, as before they were owned', () => {
  for (const [mid, why] of [
    ["grill: ''\n", /f: 'grill' must be a non-empty string/],
    ['grill: [a]\n', /f: 'grill' must be a non-empty string/],
    ['plan: {a: 1}\n', /f: 'plan' must be a non-empty string/],
  ] as const) {
    assert.throws(() => parseIssue(file(mid), 'f'), why);
  }
  assert.deepEqual(parseIssue(file('grill: 12\nplan: null\n'), 'f').extra, [{ key: 'grill', value: '12', after: 'source' }]);
});

test('a newly set grill lands in its slot, past unknown keys after source; an empty value clears it', () => {
  writeFileSync(path(), file('note: a\n'));
  editIssue(new Ctx(dir), 'PIX-1', { fields: [{ field: plan, value: 'p.md' }] });
  editIssue(new Ctx(dir), 'PIX-1', { fields: [{ field: grill, value: 'g' }] });
  assert.match(read(), /^source: user\nnote: a\ngrill: g\nplan: p\.md\ncreated: /m);
  editIssue(new Ctx(dir), 'PIX-1', { fields: [{ field: grill, value: '' }] });
  assert.match(read(), /^source: user\nnote: a\nplan: p\.md\ncreated: /m);
  const t = addIssue(new Ctx(dir), { title: 'n', project: 'PIX', fields: [{ field: grill, value: 'h' }, { field: plan, value: 'q.md' }] });
  assert.match(read('pix-2'), /^source: user\ngrill: h\nplan: q\.md\ncreated: /m);
  assert.deepEqual(owned(t, 'grill'), { grill: 'h', plan: 'q.md' });
  assert.deepEqual(loadIssues(dir)[1], t);
});

test('invalid owned values are refused on write, and nothing is saved', () => {
  writeFileSync(path(), file());
  assert.throws(() => editIssue(new Ctx(dir), 'PIX-1', { fields: [{ field: grill, value: '  ' }] }), /'grill' must be a non-empty string/);
  assert.throws(() => addIssue(new Ctx(dir), { title: 'n', project: 'PIX', fields: [{ field: plan, value: '\n' }] }), /'plan' must be a non-empty string/);
  assert.equal(read(), file());
  assert.equal(loadIssues(dir).length, 1);
});

test('every op leaves a grill issue byte-identical but for what it changes', () => {
  writeFileSync(path(), file());
  writeFileSync(path('pix-2'), file('', 'PIX-2'));
  editIssue(new Ctx(dir), 'PIX-2', { title: 'Other', blockers: ['PIX-1'] });
  setStatus(new Ctx(dir), 'PIX-2', 'doing');
  assert.equal(read(), file());

  const keep = /^source: user\ngrill: some-slug\nplan: C:\/plans\/x\.md\ncreated: 2026-10-01\n/m;
  setStatus(new Ctx(dir), 'PIX-1', 'doing');
  addComment(new Ctx(dir), 'PIX-1', 'hi', { by: 'user' });
  setPriority(new Ctx(dir), 'PIX-1', true);
  editIssue(new Ctx(dir), 'PIX-1', { title: 'New' });
  replaceBody(new Ctx(dir), 'PIX-1', 'body');
  assert.match(read(), keep);
  const before = read();
  assert.equal(serializeIssue(parseIssue(before, 'f')), before);
});

test('belay add, edit and show take grill and plan as flags', () => {
  const add = belay('add', 'Thing', '--project', 'PIX', '--grill', 'g', '--plan', 'C:/p.md');
  assert.equal(add.code, 0, add.err);
  assert.match(read(), /^source: user\ngrill: g\nplan: C:\/p\.md\ncreated: /m);
  const show = belay('show', 'PIX-1').out;
  assert.match(show, /^source: {5}user\ngrill: {6}g\nplan: {7}C:\/p\.md\ndates: /m);
  assert.equal(belay('edit', 'PIX-1', '--grill', '').code, 0);
  assert.doesNotMatch(read(), /grill:/);
  const bad = belay('edit', 'PIX-1', '--plan', ' ');
  assert.equal(bad.code, 1);
  assert.match(bad.err, /'plan' must be a non-empty string/);
});

test('grill commit commits a planned grill once, then has nothing to commit; an in-progress one exits 1', () => {
  belay('git', 'init');
  for (const [slug, status] of [['done', 'planned'], ['live', 'in-progress']]) {
    mkdirSync(join(dir, 'grills', slug), { recursive: true });
    writeFileSync(join(dir, 'grills', slug, 'session.json'), JSON.stringify({ status }));
  }
  const first = belay('grill', 'commit', 'done');
  assert.equal(first.code, 0, first.err);
  assert.equal(first.out.trim(), 'committed grill done');
  assert.equal(belay('grill', 'commit', 'done').out.trim(), 'nothing to commit');
  const live = belay('grill', 'commit', 'live');
  assert.equal(live.code, 1);
  assert.match(live.err, /^belay: grill 'live' is in-progress/);
});
