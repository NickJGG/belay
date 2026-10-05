import assert from 'node:assert/strict';
import { test } from 'node:test';
import { filterIssues, indexIssues, isReady, next, parseIssueFilter, projectBoard, projectForCwd } from '../src/query.ts';
import type { Project, Issue } from '../src/store.ts';

const project = (key: string, over: Partial<Project> = {}): Project => ({
  key,
  name: key,
  paths: [],
  status: 'active',
  focus: false,
  body: '',
  ...over,
});

const issue = (id: string, over: Partial<Issue> = {}): Issue => ({
  id,
  title: id,
  project: id.replace(/-\d+$/, ''),
  status: 'todo',
  blocked_by: [],
  source: 'user',
  created: '2026-10-01',
  updated: '2026-10-01',
  comments: [],
  body: '',
  ...over,
});

test('ready = todo with every blocker done or dropped', () => {
  const issues = [
    issue('a-1', { status: 'done' }),
    issue('a-2', { status: 'dropped' }),
    issue('a-3', { status: 'doing' }),
    issue('a-4', { blocked_by: ['a-1', 'a-2'] }),
    issue('a-5', { blocked_by: ['a-1', 'a-3'] }),
    issue('a-6', { status: 'idea' }),
    issue('a-7', { blocked_by: ['a-404'] }),
  ];
  const byId = indexIssues(issues);
  const ready = issues.filter((t) => isReady(t, byId)).map((t) => t.id);
  assert.deepEqual(ready, ['a-4', 'a-7']);
});

test('next: doing everywhere, then high, then focus oldest first; other split out', () => {
  const projects = [
    project('f', { focus: true }),
    project('o'),
    project('p', { status: 'paused', focus: true }),
  ];
  const issues = [
    issue('f-1', { created: '2026-10-03' }),
    issue('f-2', { created: '2026-10-01' }),
    issue('f-3', { created: '2026-10-01', blocked_by: ['f-1'] }),
    issue('f-4', { status: 'idea' }),
    issue('o-1', { status: 'doing' }),
    issue('o-2', { priority: 'high', created: '2026-10-05' }),
    issue('o-3'),
    issue('p-1'),
    issue('p-2', { status: 'doing' }),
    issue('p-3', { priority: 'high' }),
    issue('f-10', { created: '2026-10-01' }),
  ];
  const n = next(projects, issues);
  const ids = (ts: Issue[]) => ts.map((t) => t.id);
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

test('projectBoard orders todo ready-first, windows done, and counts the hidden', () => {
  const issues = [
    issue('a-1', { status: 'doing' }),
    issue('a-2', { blocked_by: ['a-1'] }),
    issue('a-3'),
    issue('a-4', { priority: 'high' }),
    issue('a-5', { status: 'done', updated: '2026-10-03' }),
    issue('a-6', { status: 'done', updated: '2026-09-01' }),
    issue('a-7', { status: 'dropped' }),
    issue('B-1'),
  ];
  const board = projectBoard('a', issues, { today: '2026-10-04' });
  assert.deepEqual(board.todo.map((t) => t.id), ['a-4', 'a-3', 'a-2']);
  assert.deepEqual(board.done.map((t) => t.id), ['a-5']);
  assert.equal(board.olderDone, 1);
  assert.deepEqual(board.dropped.map((t) => t.id), ['a-7']);
  const all = projectBoard('a', issues, { today: '2026-10-04', older: true });
  assert.deepEqual(all.done.map((t) => t.id), ['a-5', 'a-6']);
});

test('parseIssueFilter: defaults to open statuses and drops unknown values', () => {
  assert.deepEqual(parseIssueFilter({}), { statuses: ['idea', 'todo', 'doing'], project: undefined, ready: undefined, priority: undefined, source: undefined });
  assert.deepEqual(parseIssueFilter({ status: 'done,bogus,idea' }).statuses, ['done', 'idea']);
  assert.deepEqual(parseIssueFilter({ status: 'bogus' }).statuses, ['idea', 'todo', 'doing']);
  assert.equal(parseIssueFilter({ status: 'all' }).statuses.length, 5);
  const f = parseIssueFilter({ project: 'a', ready: '1', priority: 'high', source: 'claude' });
  assert.deepEqual([f.project, f.ready, f.priority, f.source], ['A', true, 'high', 'claude']);
  const g = parseIssueFilter({ project: '', ready: '0', priority: 'low', source: 'bot' });
  assert.deepEqual([g.project, g.ready, g.priority, g.source], [undefined, undefined, undefined, undefined]);
});

test('filterIssues combines every filter', () => {
  const issues = [
    issue('a-1', { status: 'doing' }),
    issue('a-2', { source: 'claude', priority: 'high' }),
    issue('a-3', { blocked_by: ['a-1'], source: 'claude' }),
    issue('a-4', { status: 'idea', source: 'claude' }),
    issue('B-1', { status: 'done' }),
  ];
  const ids = (q: Record<string, string>) => filterIssues(issues, parseIssueFilter(q)).map((t) => t.id);
  assert.deepEqual(ids({}), ['a-1', 'a-2', 'a-3', 'a-4']);
  assert.deepEqual(ids({ ready: '1' }), ['a-2']);
  assert.deepEqual(ids({ source: 'claude', status: 'todo' }), ['a-2', 'a-3']);
  assert.deepEqual(ids({ priority: 'high' }), ['a-2']);
  assert.deepEqual(ids({ project: 'b', status: 'all' }), ['B-1']);
  assert.deepEqual(ids({ project: 'b' }), []);
});

test('next: focus issues ordered by their project goal urgency, then oldest first', () => {
  const projects = [project('a', { focus: true }), project('b', { focus: true }), project('c', { focus: true })];
  const issues = [issue('a-1', { created: '2026-09-01' }), issue('b-1', { created: '2026-09-02' }), issue('c-1'), issue('b-2')];
  const ids = (u?: Map<string, number>) => next(projects, issues, u).focus.map((t) => t.id);
  assert.deepEqual(ids(), ['a-1', 'b-1', 'b-2', 'c-1']);
  assert.deepEqual(ids(new Map([['b', 0], ['c', 1]])), ['b-1', 'b-2', 'c-1', 'a-1']);
});
