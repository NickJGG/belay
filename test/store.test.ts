import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import {
  createIssue,
  entityForPath,
  loadOrder,
  loadProjects,
  loadIssues,
  nextIssueNumber,
  parseProject,
  parseIssue,
  saveProject,
  serializeProject,
  serializeIssue,
  sortByOrder,
  validateKey,
  type Project,
  type Issue,
} from '../src/store.ts';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tracker-'));
  mkdirSync(join(dir, 'projects'));
  mkdirSync(join(dir, 'issues'));
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

const issue = (over: Partial<Issue> = {}): Omit<Issue, 'id'> => ({
  title: 'Do the thing',
  project: 'PIX',
  status: 'todo',
  blocked_by: [],
  source: 'user',
  created: '2026-10-01',
  updated: '2026-10-01',
  body: '',
  ...over,
});

test('issue frontmatter round-trips, including optional fields and body', () => {
  const t: Issue = {
    id: 'PIX-3',
    ...issue({ priority: 'high', grill: 'some-slug', plan: 'C:/plans/x.md', blocked_by: ['PIX-1'], title: '2048: "quoted" title' }),
    body: 'notes\n\n- 2026-10-02: more',
  };
  assert.deepEqual(parseIssue(serializeIssue(t), 'x'), t);
});

test('serialized issue omits unset optional fields', () => {
  const src = serializeIssue({ id: 'PIX-1', ...issue() });
  assert.doesNotMatch(src, /priority|grill|plan/);
  assert.match(src, /^blocked_by: \[\]$/m);
});

test('project round-trips', () => {
  const p: Project = { key: 'ELV', name: 'Elevators', paths: ['C:/a', 'C:/b c'], status: 'paused', focus: true, group: 'PZ Mods', body: 'hello' };
  assert.deepEqual(parseProject(serializeProject(p), 'x'), p);
});

test('lowercase and long pre-rule keys load uppercased', () => {
  const t = parseIssue('---\nid: pz-elevators-2\nproject: pz-elevators\ntitle: x\nstatus: todo\nblocked_by: [pz-elevators-1]\ncreated: a\nupdated: a\n---\n', 'f');
  assert.deepEqual([t.id, t.project, t.blocked_by], ['PZ-ELEVATORS-2', 'PZ-ELEVATORS', ['PZ-ELEVATORS-1']]);
  assert.equal(parseProject('---\nkey: pz-elevators\nname: x\n---\n', 'f').key, 'PZ-ELEVATORS');
});

test('new keys must be 3–4 letters', () => {
  for (const ok of ['ELV', 'PORT']) validateKey(ok);
  for (const bad of ['EL', 'PORTF', 'EL1', 'pz-elevators', 'elv']) assert.throws(() => validateKey(bad), /3–4 letters/, bad);
});

test('parse rejects bad fields with the file name', () => {
  assert.throws(() => parseIssue('---\nid: pi-1\nproject: pi\ntitle: x\nstatus: blocked\ncreated: a\nupdated: a\n---\n', 'issues/pi-1.md'), /issues\/pi-1\.md: 'status'/);
  assert.throws(() => parseIssue('---\nid: pi-1\nproject: dono\ntitle: x\nstatus: todo\ncreated: a\nupdated: a\n---\n', 'f'), /does not match project/);
  assert.throws(() => parseIssue('no frontmatter', 'f'), /missing frontmatter/);
  assert.throws(() => parseProject('---\nkey: Bad_Key\nname: x\n---\n', 'f'), /invalid project key/);
});

test('hand-written files with CRLF parse', () => {
  const t = parseIssue('---\r\nid: pi-1\r\nproject: pi\r\ntitle: x\r\nstatus: idea\r\ncreated: 2026-10-01\r\nupdated: 2026-10-01\r\n---\r\n\r\nbody\r\n', 'f');
  assert.equal(t.status, 'idea');
  assert.equal(t.source, 'user');
  assert.deepEqual(t.blocked_by, []);
  assert.equal(t.body, 'body');
});

test('IDs: max existing n for the key, + 1, ignoring other keys and gaps', () => {
  assert.equal(nextIssueNumber(dir, 'PIX'), 1);
  writeFileSync(join(dir, 'issues', 'pix-2.md'), '');
  writeFileSync(join(dir, 'issues', 'pix-10.md'), '');
  writeFileSync(join(dir, 'issues', 'pix-ext-50.md'), '');
  writeFileSync(join(dir, 'issues', 'dono-99.md'), '');
  assert.equal(nextIssueNumber(dir, 'PIX'), 11);
  assert.equal(nextIssueNumber(dir, 'PIX-EXT'), 51);
  assert.equal(nextIssueNumber(dir, 'DONO'), 100);
});

test('createIssue allocates sequential IDs and writes files that load back', () => {
  const a = createIssue(dir, issue({ title: 'a' }));
  const b = createIssue(dir, issue({ title: 'b' }));
  const c = createIssue(dir, issue({ title: 'c', project: 'DON' }));
  assert.deepEqual([a.id, b.id, c.id], ['PIX-1', 'PIX-2', 'DON-1']);
  assert.deepEqual(loadIssues(dir).map((t) => t.id), ['DON-1', 'PIX-1', 'PIX-2']);
  assert.match(readFileSync(join(dir, 'issues', 'pix-2.md'), 'utf8'), /^id: PIX-2$/m);
});

test('loadIssues sorts numerically and checks file names', () => {
  for (const n of [10, 2, 1]) createIssue(dir, issue({ title: `t${n}` }));
  assert.deepEqual(loadIssues(dir).map((t) => t.id), ['PIX-1', 'PIX-2', 'PIX-3']);
  writeFileSync(join(dir, 'issues', 'pix-9.md'), serializeIssue({ id: 'PIX-8', ...issue() }));
  assert.throws(() => loadIssues(dir), /issues\/pix-9\.md: id 'PIX-8' does not match file name/);
});

test('saveProject + loadProjects', () => {
  saveProject(dir, { key: 'PIX', name: 'Pixel Imperium', paths: ['C:/x'], status: 'active', focus: false, body: '' });
  assert.equal(loadProjects(dir)[0].name, 'Pixel Imperium');
  assert.ok(existsSync(join(dir, 'projects', 'pix.md')));
});

test('entityForPath: issue and project files, either separator, not temp files', () => {
  assert.deepEqual(entityForPath('issues/elv-1.md'), { kind: 'issue', id: 'ELV-1' });
  assert.deepEqual(entityForPath('projects\\elv.md'), { kind: 'project', id: 'ELV' });
  assert.equal(entityForPath('issues/a-1.md.123.tmp'), undefined);
  assert.equal(entityForPath('settings.yaml'), undefined);
  assert.equal(entityForPath('issues'), undefined);
});

test('sortByOrder puts listed keys first in list order, then unlisted by key, ignoring stale keys', () => {
  const p = (key: string): Project => ({ key, name: key, paths: [], status: 'active', focus: false, body: '' });
  const projects = ['DDD', 'AAA', 'CCC', 'BBB'].map(p);
  assert.deepEqual(sortByOrder(projects, ['CCC', 'GONE', 'AAA']).map((x) => x.key), ['CCC', 'AAA', 'BBB', 'DDD']);
  assert.deepEqual(sortByOrder(projects, []).map((x) => x.key), ['AAA', 'BBB', 'CCC', 'DDD']);
});

test('loadOrder: missing file is empty, keys are canonicalised, bad shapes throw', () => {
  assert.deepEqual(loadOrder(dir), []);
  writeFileSync(join(dir, 'order.yaml'), 'project_order: [elv, " Pix "]');
  assert.deepEqual(loadOrder(dir), ['ELV', 'PIX']);
  writeFileSync(join(dir, 'order.yaml'), 'project_order: [1, 2]');
  assert.throws(() => loadOrder(dir), /order.yaml: 'project_order' must be a list of strings/);
  writeFileSync(join(dir, 'order.yaml'), '- ELV');
  assert.throws(() => loadOrder(dir), /order.yaml: not a mapping/);
});
