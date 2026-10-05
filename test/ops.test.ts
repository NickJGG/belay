import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import {
  ConflictError,
  Ctx,
  addProject,
  addTask,
  bodyHash,
  deleteTask,
  editProject,
  editTask,
  moveProject,
  rekeyProject,
  replaceBody,
  setFocus,
  setPriority,
  setStatus,
} from '../src/ops.ts';
import { next } from '../src/query.ts';
import { createTask, loadOrder, loadProjects, loadTasks, saveOrder, saveProject, today, type Task } from '../src/store.ts';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tracker-'));
  mkdirSync(join(dir, 'projects'));
  mkdirSync(join(dir, 'tasks'));
  saveProject(dir, { key: 'PIX', name: 'Pixel Imperium', paths: ['C:/x'], status: 'active', focus: false, body: '' });
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

test('setStatus re-reads: a note appended after an earlier load survives', () => {
  createTask(dir, task());
  const stale = new Ctx(dir);
  const file = join(dir, 'tasks', 'pix-1.md');
  writeFileSync(file, `${readFileSync(file, 'utf8')}\n- 2026-10-02: claude was here\n`);
  assert.equal(stale.task('PIX-1').body, '');
  const { before, task: t } = setStatus(new Ctx(dir), 'PIX-1', 'doing');
  assert.equal(before, 'todo');
  assert.equal(t.status, 'doing');
  assert.match(loadTasks(dir)[0].body, /claude was here/);
});

test('setStatus reports open blockers and rejects bad statuses', () => {
  createTask(dir, task({ title: 'blocker' }));
  createTask(dir, task({ blocked_by: ['PIX-1'] }));
  assert.deepEqual(setStatus(new Ctx(dir), 'PIX-2', 'doing').open.map((t) => t.id), ['PIX-1']);
  assert.throws(() => setStatus(new Ctx(dir), 'PIX-2', 'blocked'), /status must be one of/);
  assert.throws(() => setStatus(new Ctx(dir), 'PIX-9', 'done'), /no task 'PIX-9'/);
});

test('addTask validates title, project, status and blockers', () => {
  const ctx = new Ctx(dir);
  assert.throws(() => addTask(ctx, { title: '  ', project: 'PIX' }), /title is empty/);
  assert.throws(() => addTask(ctx, { title: 'x', project: 'nope' }), /no project 'nope'/);
  assert.throws(() => addTask(ctx, { title: 'x', project: 'PIX', status: 'doing' }), /status must be one of idea\|todo/);
  assert.throws(() => addTask(ctx, { title: 'x', project: 'PIX', blockers: ['PIX-7'] }), /no task 'PIX-7'/);
  const t = addTask(ctx, { title: ' x ', project: 'PIX', status: 'idea', source: 'claude', note: 'why' });
  assert.equal(t.id, 'PIX-1');
  assert.equal(t.title, 'x');
  assert.match(t.body, /^- \d{4}-\d{2}-\d{2}: why$/);
});

test('a task cannot block itself', () => {
  createTask(dir, task());
  assert.throws(() => new Ctx(dir).checkBlockers('PIX-1', ['PIX-1']), /cannot block itself/);
});

test('setPriority and setFocus round-trip', () => {
  createTask(dir, task());
  setPriority(new Ctx(dir), 'PIX-1', true);
  assert.equal(loadTasks(dir)[0].priority, 'high');
  setPriority(new Ctx(dir), 'PIX-1', false);
  assert.equal(loadTasks(dir)[0].priority, undefined);
  assert.doesNotMatch(readFileSync(join(dir, 'tasks', 'pix-1.md'), 'utf8'), /priority/);

  setFocus(new Ctx(dir), 'PIX', true);
  assert.equal(loadProjects(dir)[0].focus, true);
  setFocus(new Ctx(dir), 'PIX', false);
  assert.equal(loadProjects(dir)[0].focus, false);
});

test('editTask sets, clears and validates fields like the old cmdEdit', () => {
  createTask(dir, task({ title: 'blocker' }));
  createTask(dir, task({ grill: 'g', plan: 'p.md' }));
  const t = editTask(new Ctx(dir), 'PIX-2', { title: ' New ', blockers: ['PIX-1'], priority: 'high', grill: '', note: 'n' });
  assert.deepEqual(loadTasks(dir)[1], t);
  assert.equal(t.title, 'New');
  assert.deepEqual(t.blocked_by, ['PIX-1']);
  assert.equal(t.priority, 'high');
  assert.equal(t.grill, undefined);
  assert.equal(t.plan, 'p.md');
  assert.equal(t.updated, today());
  assert.match(t.body, /^- \d{4}-\d{2}-\d{2}: n$/);

  assert.equal(editTask(new Ctx(dir), 'PIX-2', { priority: 'none' }).priority, undefined);
  assert.throws(() => editTask(new Ctx(dir), 'PIX-2', { title: ' ' }), /title is empty/);
  assert.throws(() => editTask(new Ctx(dir), 'PIX-2', { priority: 'low' }), /priority must be one of high\|none/);
  assert.throws(() => editTask(new Ctx(dir), 'PIX-2', { blockers: ['PIX-2'] }), /cannot block itself/);
  assert.throws(() => editTask(new Ctx(dir), 'PIX-2', { blockers: ['PIX-9'] }), /no task 'PIX-9'/);
});

test('editTask replaces the body, then appends the note', () => {
  createTask(dir, task({ body: 'old' }));
  const t = editTask(new Ctx(dir), 'PIX-1', { body: '  fresh\n', note: 'later' });
  assert.match(t.body, /^fresh\n- \d{4}-\d{2}-\d{2}: later$/);
});

test('replaceBody saves on a matching hash and conflicts on a stale one', () => {
  createTask(dir, task({ body: 'v1' }));
  const loaded = bodyHash(new Ctx(dir).task('PIX-1').body);
  replaceBody(new Ctx(dir), 'PIX-1', 'v2', loaded);
  assert.equal(loadTasks(dir)[0].body, 'v2');

  assert.throws(
    () => replaceBody(new Ctx(dir), 'PIX-1', 'v3', loaded),
    (e) => e instanceof ConflictError && e.current === 'v2',
  );
  assert.equal(loadTasks(dir)[0].body, 'v2');
  replaceBody(new Ctx(dir), 'PIX-1', 'v4');
  assert.equal(loadTasks(dir)[0].body, 'v4');
});

test('deleteTask strips the id from dependents, notes it, and makes them ready', () => {
  saveProject(dir, { key: 'PIX', name: 'Pixel Imperium', paths: [], status: 'active', focus: true, body: '' });
  createTask(dir, task({ title: 'doomed' }));
  createTask(dir, task({ title: 'other' }));
  createTask(dir, task({ title: 'dependent', blocked_by: ['PIX-1', 'PIX-2'] }));
  createTask(dir, task({ title: 'solo', blocked_by: ['PIX-1'] }));

  const dependents = deleteTask(new Ctx(dir), 'PIX-1');
  assert.deepEqual(dependents.map((t) => t.id), ['PIX-3', 'PIX-4']);
  assert.equal(existsSync(join(dir, 'tasks', 'pix-1.md')), false);
  const tasks = loadTasks(dir);
  assert.deepEqual(tasks.map((t) => [t.id, t.blocked_by]), [['PIX-2', []], ['PIX-3', ['PIX-2']], ['PIX-4', []]]);
  assert.match(tasks[2].body, /^- \d{4}-\d{2}-\d{2}: blocker PIX-1 deleted$/);
  assert.equal(tasks[0].body, '');
  assert.ok(next(loadProjects(dir), tasks).focus.some((t) => t.id === 'PIX-4'));
  assert.throws(() => deleteTask(new Ctx(dir), 'PIX-1'), /no task 'PIX-1'/);
});

test('deleteTask writes dependents before removing the file', () => {
  createTask(dir, task({ title: 'doomed' }));
  createTask(dir, task({ blocked_by: ['PIX-1'] }));
  // A directory where the atomic write's temp file goes makes the dependent's save fail.
  mkdirSync(join(dir, 'tasks', `pix-2.md.${process.pid}.tmp`));
  assert.throws(() => deleteTask(new Ctx(dir), 'PIX-1'));
  assert.ok(existsSync(join(dir, 'tasks', 'pix-1.md')));
});

test('editProject sets, clears and validates fields', () => {
  const p = editProject(new Ctx(dir), 'PIX', { name: ' PI ', group: 'games', status: 'paused', focus: true });
  assert.deepEqual(loadProjects(dir)[0], p);
  assert.deepEqual([p.name, p.group, p.status, p.focus], ['PI', 'games', 'paused', true]);
  assert.equal(editProject(new Ctx(dir), 'PIX', { group: '' }).group, undefined);
  assert.throws(() => editProject(new Ctx(dir), 'PIX', { name: '' }), /name is empty/);
  assert.throws(() => editProject(new Ctx(dir), 'PIX', { status: 'gone' }), /status must be one of active\|paused\|archived/);
  assert.throws(() => editProject(new Ctx(dir), 'nope', {}), /no project 'nope'/);
});

test('keys and IDs are case-insensitive and stored uppercase', () => {
  createTask(dir, task());
  const t = addTask(new Ctx(dir), { title: 'x', project: 'pix', blockers: ['pix-1'] });
  assert.deepEqual([t.id, t.project, t.blocked_by], ['PIX-2', 'PIX', ['PIX-1']]);
  assert.equal(setStatus(new Ctx(dir), 'Pix-2', 'doing').task.id, 'PIX-2');
  assert.throws(() => editTask(new Ctx(dir), 'pix-2', { blockers: ['PIX-2'] }), /cannot block itself/);
  assert.deepEqual(deleteTask(new Ctx(dir), 'pix-1').map((d) => d.blocked_by), [[]]);
});

test('addProject derives a 3-letter key, 4 on a clash, or takes one', () => {
  const add = (name: string, key?: string) => addProject(new Ctx(dir), { name, key, paths: [dir] }).project.key;
  assert.equal(add('Rideable Elevators'), 'REL');
  assert.equal(add('Rideable Elevator Lights'), 'RELR');
  assert.equal(add('Portfolio site', 'port'), 'PORT');
  assert.ok(existsSync(join(dir, 'projects', 'port.md')));
  assert.throws(() => add('Anything', 'rel'), /project 'REL' already exists/);
  assert.throws(() => add('Anything', 'pz-x'), /3–4 letters/);
  assert.throws(() => addProject(new Ctx(dir), { name: 'X', paths: [] }), /at least one path/);
});

test('rekeyProject renames the project, its tasks and every blocker reference', () => {
  saveProject(dir, { key: 'PZ-ELEVATORS', name: 'Rideable Elevators', paths: [], status: 'active', focus: true, body: '' });
  createTask(dir, task({ project: 'PZ-ELEVATORS' }));
  createTask(dir, task({ project: 'PZ-ELEVATORS', blocked_by: ['PZ-ELEVATORS-1'] }));
  createTask(dir, task({ blocked_by: ['PZ-ELEVATORS-2'] }));

  const { renamed } = rekeyProject(new Ctx(dir), 'pz-elevators', 'elv');
  assert.deepEqual([...renamed], [['PZ-ELEVATORS-1', 'ELV-1'], ['PZ-ELEVATORS-2', 'ELV-2']]);
  assert.deepEqual(loadProjects(dir).map((p) => [p.key, p.focus]), [['ELV', true], ['PIX', false]]);
  assert.deepEqual(loadTasks(dir).map((t) => [t.id, t.project, t.blocked_by]), [
    ['ELV-1', 'ELV', []],
    ['ELV-2', 'ELV', ['ELV-1']],
    ['PIX-1', 'PIX', ['ELV-2']],
  ]);
  assert.equal(existsSync(join(dir, 'projects', 'pz-elevators.md')), false);
  assert.throws(() => rekeyProject(new Ctx(dir), 'elv', 'pix'), /project 'PIX' already exists/);
  assert.throws(() => rekeyProject(new Ctx(dir), 'elv', 'elevator'), /3–4 letters/);
});

test('moveProject places a project before, after, at the top or bottom, and saves the full order', () => {
  for (const key of ['ELV', 'FRG']) saveProject(dir, { key, name: key, paths: [], status: 'active', focus: false, body: '' });
  const keys = () => new Ctx(dir).projects.map((p) => p.key);
  assert.deepEqual(keys(), ['ELV', 'FRG', 'PIX']);

  assert.deepEqual(moveProject(new Ctx(dir), 'pix', 'top'), ['PIX', 'ELV', 'FRG']);
  assert.deepEqual(loadOrder(dir), ['PIX', 'ELV', 'FRG']);
  moveProject(new Ctx(dir), 'pix', 'bottom');
  assert.deepEqual(keys(), ['ELV', 'FRG', 'PIX']);
  moveProject(new Ctx(dir), 'frg', { before: 'elv' });
  assert.deepEqual(keys(), ['FRG', 'ELV', 'PIX']);
  moveProject(new Ctx(dir), 'frg', { after: 'pix' });
  assert.deepEqual(keys(), ['ELV', 'PIX', 'FRG']);
  moveProject(new Ctx(dir), 'elv', { after: 'pix' });
  assert.deepEqual(keys(), ['PIX', 'ELV', 'FRG']);

  assert.throws(() => moveProject(new Ctx(dir), 'elv', { before: 'nope' }), /no project 'nope'/);
  assert.throws(() => moveProject(new Ctx(dir), 'elv', { after: 'ELV' }), /relative to itself/);
});

test('moveProject materialises unlisted projects where they currently sort', () => {
  for (const key of ['ELV', 'FRG', 'ZED']) saveProject(dir, { key, name: key, paths: [], status: 'active', focus: false, body: '' });
  saveOrder(dir, ['FRG', 'GONE']);
  moveProject(new Ctx(dir), 'zed', { before: 'pix' });
  assert.deepEqual(loadOrder(dir), ['FRG', 'ELV', 'ZED', 'PIX']);
});

test('rekeyProject renames the key in order.yaml', () => {
  saveProject(dir, { key: 'PZ-ELEVATORS', name: 'Elevators', paths: [], status: 'active', focus: false, body: '' });
  saveOrder(dir, ['PZ-ELEVATORS', 'PIX']);
  rekeyProject(new Ctx(dir), 'pz-elevators', 'elv');
  assert.deepEqual(loadOrder(dir), ['ELV', 'PIX']);
  assert.deepEqual(new Ctx(dir).projects.map((p) => p.key), ['ELV', 'PIX']);
});

test('rekeyProject leaves order.yaml alone when the project is unlisted', () => {
  rekeyProject(new Ctx(dir), 'pix', 'pxl');
  assert.equal(existsSync(join(dir, 'order.yaml')), false);
});
