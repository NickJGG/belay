import assert from 'node:assert/strict';
import { test } from 'node:test';
import { indexTasks, isReady, next, projectForCwd } from '../src/query.ts';
import type { Project, Task } from '../src/store.ts';

const project = (key: string, over: Partial<Project> = {}): Project => ({
  key,
  name: key,
  paths: [],
  status: 'active',
  focus: false,
  body: '',
  ...over,
});

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  title: id,
  project: id.replace(/-\d+$/, ''),
  status: 'todo',
  blocked_by: [],
  source: 'user',
  created: '2026-10-01',
  updated: '2026-10-01',
  body: '',
  ...over,
});

test('ready = todo with every blocker done or dropped', () => {
  const tasks = [
    task('a-1', { status: 'done' }),
    task('a-2', { status: 'dropped' }),
    task('a-3', { status: 'doing' }),
    task('a-4', { blocked_by: ['a-1', 'a-2'] }),
    task('a-5', { blocked_by: ['a-1', 'a-3'] }),
    task('a-6', { status: 'idea' }),
    task('a-7', { blocked_by: ['a-404'] }),
  ];
  const byId = indexTasks(tasks);
  const ready = tasks.filter((t) => isReady(t, byId)).map((t) => t.id);
  assert.deepEqual(ready, ['a-4', 'a-7']);
});

test('next: doing everywhere, then high, then focus oldest first; other split out', () => {
  const projects = [
    project('f', { focus: true }),
    project('o'),
    project('p', { status: 'paused', focus: true }),
  ];
  const tasks = [
    task('f-1', { created: '2026-10-03' }),
    task('f-2', { created: '2026-10-01' }),
    task('f-3', { created: '2026-10-01', blocked_by: ['f-1'] }),
    task('f-4', { status: 'idea' }),
    task('o-1', { status: 'doing' }),
    task('o-2', { priority: 'high', created: '2026-10-05' }),
    task('o-3'),
    task('p-1'),
    task('p-2', { status: 'doing' }),
    task('p-3', { priority: 'high' }),
    task('f-10', { created: '2026-10-01' }),
  ];
  const n = next(projects, tasks);
  const ids = (ts: Task[]) => ts.map((t) => t.id);
  assert.deepEqual(ids(n.doing), ['o-1', 'p-2']);
  assert.deepEqual(ids(n.high), ['o-2']);
  assert.deepEqual(ids(n.focus), ['f-2', 'f-10', 'f-1']);
  assert.deepEqual(ids(n.other), ['o-3']);
});

test('projectForCwd: longest prefix, segment boundaries, case-insensitive on Windows', () => {
  const projects = [
    project('umbrella', { paths: ['C:/Users/Nick/Projects/Mods/Project Zomboid'] }),
    project('elevators', { paths: ['C:/Users/Nick/Projects/Mods/Project Zomboid/Nick-s-Rideable-Elevators'] }),
    project('pi', { paths: ['C:/Users/Nick/Projects/Games/Pixel Imperium', 'C:/Users/Nick/Projects/Websites/pixel-imperium'] }),
  ];
  const key = (cwd: string, platform: NodeJS.Platform = 'win32') => projectForCwd(projects, cwd, platform)?.key;
  assert.equal(key('C:\\Users\\Nick\\Projects\\Mods\\Project Zomboid\\Nick-s-Rideable-Elevators\\media'), 'elevators');
  assert.equal(key('c:/users/nick/projects/mods/project zomboid/'), 'umbrella');
  assert.equal(key('C:/Users/Nick/Projects/Mods/Project Zomboid Extra'), undefined);
  assert.equal(key('C:/Users/Nick/Projects/Websites/pixel-imperium/src'), 'pi');
  assert.equal(key('/c/Users/Nick/Projects/Games/Pixel Imperium'), 'pi');
  assert.equal(key('C:/Users/Nick/Projects'), undefined);
  assert.equal(key('c:/users/nick/projects/websites/pixel-imperium', 'linux'), undefined);
});
