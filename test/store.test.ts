import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import {
  createTask,
  entityForPath,
  loadProjects,
  loadTasks,
  nextTaskNumber,
  parseProject,
  parseTask,
  saveProject,
  serializeProject,
  serializeTask,
  validateKey,
  type Project,
  type Task,
} from '../src/store.ts';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tracker-'));
  mkdirSync(join(dir, 'projects'));
  mkdirSync(join(dir, 'tasks'));
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

const task = (over: Partial<Task> = {}): Omit<Task, 'id'> => ({
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

test('task frontmatter round-trips, including optional fields and body', () => {
  const t: Task = {
    id: 'PIX-3',
    ...task({ priority: 'high', grill: 'some-slug', plan: 'C:/plans/x.md', blocked_by: ['PIX-1'], title: '2048: "quoted" title' }),
    body: 'notes\n\n- 2026-10-02: more',
  };
  assert.deepEqual(parseTask(serializeTask(t), 'x'), t);
});

test('serialized task omits unset optional fields', () => {
  const src = serializeTask({ id: 'PIX-1', ...task() });
  assert.doesNotMatch(src, /priority|grill|plan/);
  assert.match(src, /^blocked_by: \[\]$/m);
});

test('project round-trips', () => {
  const p: Project = { key: 'ELV', name: 'Elevators', paths: ['C:/a', 'C:/b c'], status: 'paused', focus: true, group: 'PZ Mods', body: 'hello' };
  assert.deepEqual(parseProject(serializeProject(p), 'x'), p);
});

test('lowercase and long pre-rule keys load uppercased', () => {
  const t = parseTask('---\nid: pz-elevators-2\nproject: pz-elevators\ntitle: x\nstatus: todo\nblocked_by: [pz-elevators-1]\ncreated: a\nupdated: a\n---\n', 'f');
  assert.deepEqual([t.id, t.project, t.blocked_by], ['PZ-ELEVATORS-2', 'PZ-ELEVATORS', ['PZ-ELEVATORS-1']]);
  assert.equal(parseProject('---\nkey: pz-elevators\nname: x\n---\n', 'f').key, 'PZ-ELEVATORS');
});

test('new keys must be 3–4 letters', () => {
  for (const ok of ['ELV', 'PORT']) validateKey(ok);
  for (const bad of ['EL', 'PORTF', 'EL1', 'pz-elevators', 'elv']) assert.throws(() => validateKey(bad), /3–4 letters/, bad);
});

test('parse rejects bad fields with the file name', () => {
  assert.throws(() => parseTask('---\nid: pi-1\nproject: pi\ntitle: x\nstatus: blocked\ncreated: a\nupdated: a\n---\n', 'tasks/pi-1.md'), /tasks\/pi-1\.md: 'status'/);
  assert.throws(() => parseTask('---\nid: pi-1\nproject: dono\ntitle: x\nstatus: todo\ncreated: a\nupdated: a\n---\n', 'f'), /does not match project/);
  assert.throws(() => parseTask('no frontmatter', 'f'), /missing frontmatter/);
  assert.throws(() => parseProject('---\nkey: Bad_Key\nname: x\n---\n', 'f'), /invalid project key/);
});

test('hand-written files with CRLF parse', () => {
  const t = parseTask('---\r\nid: pi-1\r\nproject: pi\r\ntitle: x\r\nstatus: idea\r\ncreated: 2026-10-01\r\nupdated: 2026-10-01\r\n---\r\n\r\nbody\r\n', 'f');
  assert.equal(t.status, 'idea');
  assert.equal(t.source, 'user');
  assert.deepEqual(t.blocked_by, []);
  assert.equal(t.body, 'body');
});

test('IDs: max existing n for the key, + 1, ignoring other keys and gaps', () => {
  assert.equal(nextTaskNumber(dir, 'PIX'), 1);
  writeFileSync(join(dir, 'tasks', 'pix-2.md'), '');
  writeFileSync(join(dir, 'tasks', 'pix-10.md'), '');
  writeFileSync(join(dir, 'tasks', 'pix-ext-50.md'), '');
  writeFileSync(join(dir, 'tasks', 'dono-99.md'), '');
  assert.equal(nextTaskNumber(dir, 'PIX'), 11);
  assert.equal(nextTaskNumber(dir, 'PIX-EXT'), 51);
  assert.equal(nextTaskNumber(dir, 'DONO'), 100);
});

test('createTask allocates sequential IDs and writes files that load back', () => {
  const a = createTask(dir, task({ title: 'a' }));
  const b = createTask(dir, task({ title: 'b' }));
  const c = createTask(dir, task({ title: 'c', project: 'DON' }));
  assert.deepEqual([a.id, b.id, c.id], ['PIX-1', 'PIX-2', 'DON-1']);
  assert.deepEqual(loadTasks(dir).map((t) => t.id), ['DON-1', 'PIX-1', 'PIX-2']);
  assert.match(readFileSync(join(dir, 'tasks', 'pix-2.md'), 'utf8'), /^id: PIX-2$/m);
});

test('loadTasks sorts numerically and checks file names', () => {
  for (const n of [10, 2, 1]) createTask(dir, task({ title: `t${n}` }));
  assert.deepEqual(loadTasks(dir).map((t) => t.id), ['PIX-1', 'PIX-2', 'PIX-3']);
  writeFileSync(join(dir, 'tasks', 'pix-9.md'), serializeTask({ id: 'PIX-8', ...task() }));
  assert.throws(() => loadTasks(dir), /tasks\/pix-9\.md: id 'PIX-8' does not match file name/);
});

test('saveProject + loadProjects', () => {
  saveProject(dir, { key: 'PIX', name: 'Pixel Imperium', paths: ['C:/x'], status: 'active', focus: false, body: '' });
  assert.equal(loadProjects(dir)[0].name, 'Pixel Imperium');
  assert.ok(existsSync(join(dir, 'projects', 'pix.md')));
});

test('entityForPath: task and project files, either separator, not temp files', () => {
  assert.deepEqual(entityForPath('tasks/elv-1.md'), { kind: 'task', id: 'ELV-1' });
  assert.deepEqual(entityForPath('projects\\elv.md'), { kind: 'project', id: 'ELV' });
  assert.equal(entityForPath('tasks/a-1.md.123.tmp'), undefined);
  assert.equal(entityForPath('settings.yaml'), undefined);
  assert.equal(entityForPath('tasks'), undefined);
});
