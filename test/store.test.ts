import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import {
  createTask,
  loadProjects,
  loadTasks,
  nextTaskNumber,
  parseProject,
  parseTask,
  saveProject,
  serializeProject,
  serializeTask,
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
  project: 'pi',
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
    id: 'pi-3',
    ...task({ priority: 'high', grill: 'some-slug', plan: 'C:/plans/x.md', blocked_by: ['pi-1'], title: '2048: "quoted" title' }),
    body: 'notes\n\n- 2026-10-02: more',
  };
  assert.deepEqual(parseTask(serializeTask(t), 'x'), t);
});

test('serialized task omits unset optional fields', () => {
  const src = serializeTask({ id: 'pi-1', ...task() });
  assert.doesNotMatch(src, /priority|grill|plan/);
  assert.match(src, /^blocked_by: \[\]$/m);
});

test('project round-trips', () => {
  const p: Project = { key: 'pz-elevators', name: 'Elevators', paths: ['C:/a', 'C:/b c'], status: 'paused', focus: true, group: 'PZ Mods', body: 'hello' };
  assert.deepEqual(parseProject(serializeProject(p), 'x'), p);
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
  assert.equal(nextTaskNumber(dir, 'pi'), 1);
  writeFileSync(join(dir, 'tasks', 'pi-2.md'), '');
  writeFileSync(join(dir, 'tasks', 'pi-10.md'), '');
  writeFileSync(join(dir, 'tasks', 'pi-ext-50.md'), '');
  writeFileSync(join(dir, 'tasks', 'dono-99.md'), '');
  assert.equal(nextTaskNumber(dir, 'pi'), 11);
  assert.equal(nextTaskNumber(dir, 'pi-ext'), 51);
  assert.equal(nextTaskNumber(dir, 'dono'), 100);
});

test('createTask allocates sequential IDs and writes files that load back', () => {
  const a = createTask(dir, task({ title: 'a' }));
  const b = createTask(dir, task({ title: 'b' }));
  const c = createTask(dir, task({ title: 'c', project: 'dono' }));
  assert.deepEqual([a.id, b.id, c.id], ['pi-1', 'pi-2', 'dono-1']);
  assert.deepEqual(loadTasks(dir).map((t) => t.id), ['dono-1', 'pi-1', 'pi-2']);
  assert.match(readFileSync(join(dir, 'tasks', 'pi-2.md'), 'utf8'), /^title: b$/m);
});

test('loadTasks sorts numerically and checks file names', () => {
  for (const n of [10, 2, 1]) createTask(dir, task({ title: `t${n}` }));
  assert.deepEqual(loadTasks(dir).map((t) => t.id), ['pi-1', 'pi-2', 'pi-3']);
  writeFileSync(join(dir, 'tasks', 'pi-9.md'), serializeTask({ id: 'pi-8', ...task() }));
  assert.throws(() => loadTasks(dir), /tasks\/pi-9\.md: id 'pi-8' does not match file name/);
});

test('saveProject + loadProjects', () => {
  saveProject(dir, { key: 'pi', name: 'Pixel Imperium', paths: ['C:/x'], status: 'active', focus: false, body: '' });
  assert.equal(loadProjects(dir)[0].name, 'Pixel Imperium');
});
