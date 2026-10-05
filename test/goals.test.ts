import assert from 'node:assert/strict';
import { test } from 'node:test';
import { burndown, goalLabel, goalProgress, goalSpec, goalStrip, goalsProgress, parseGoalSpec, urgencies } from '../src/goals.ts';
import type { DatedEntry } from '../src/logs.ts';
import type { Goal, Issue, Project, Transition } from '../src/store.ts';

const project = (goal: Goal, over: Partial<Project> = {}): Project => ({
  key: 'JOB',
  name: 'Job search',
  paths: [],
  status: 'active',
  focus: true,
  kinds: ['applied', 'outreach'],
  goal,
  body: '',
  ...over,
});

let n = 0;
const issue = (status: Issue['status'], over: Partial<Issue> = {}): Issue => ({
  id: `JOB-${++n}`,
  title: 'x',
  project: 'JOB',
  status,
  blocked_by: [],
  source: 'user',
  created: '2026-09-01',
  updated: '2026-09-01',
  comments: [],
  body: '',
  ...over,
});

const doneAt = (at: string): Transition[] => [{ at, from: 'doing', to: 'done', by: 'user' }];

const log = (day: string, over: Partial<DatedEntry> = {}): DatedEntry => ({ project: 'JOB', at: `${day}T12:00`, by: 'user', text: 'x', day, n: 1, ...over });

const target = (...a: Parameters<typeof goalProgress>) => {
  const g = goalProgress(...a);
  assert.ok(g?.form === 'target');
  return g;
};

// 2026-10-05 is a Monday; 2026-10-08 a Thursday.
const THU = '2026-10-08';

test('goals only count on active focus projects', () => {
  const moved = new Set([THU]);
  assert.equal(goalProgress(project({ habit: 5 }, { focus: false }), [], [], moved, THU), undefined);
  assert.equal(goalProgress(project({ habit: 5 }, { status: 'paused' }), [], [], moved, THU), undefined);
  assert.equal(goalProgress(project({ habit: 5 }, { goal: undefined }), [], [], moved, THU), undefined);
});

test('habit: moved days this Mon–Sun week, and whether today counted', () => {
  const moved = new Set(['2026-10-04', '2026-10-05', '2026-10-07']);
  const g = goalProgress(project({ habit: 5 }), [], [], moved, THU)!;
  assert.deepEqual(g, { project: 'JOB', urgency: 1, form: 'habit', done: 2, of: 5, metToday: false });
  assert.equal(goalLabel(g), 'JOB 2/5');
  moved.add(THU);
  const met = goalProgress(project({ habit: 5 }), [], [], moved, THU)!;
  assert.equal(met.urgency, 2);
  assert.equal(goalLabel(met), 'JOB 3/5 ✓');
});

test('habit: a new week starts from zero on Monday', () => {
  const g = goalProgress(project({ habit: 3 }), [], [], new Set(['2026-10-09', '2026-10-11']), '2026-10-12')!;
  assert.equal(goalLabel(g), 'JOB 0/3');
});

test('quantity: sums counts of the kind this week; backdated entries count on their day', () => {
  const logs = [
    log('2026-10-04', { kind: 'applied', count: 9 }),
    log('2026-10-05', { kind: 'applied', count: 3 }),
    log('2026-10-06', { kind: 'applied', at: '2026-10-08T09:00' }),
    log('2026-10-07', { kind: 'outreach', count: 4 }),
    log('2026-10-07', { text: 'note' }),
    log(THU, { project: 'PORT', kind: 'applied' }),
  ];
  const g = goalProgress(project({ quantity: 10, kind: 'applied' }), [], logs, new Set(), THU)!;
  assert.deepEqual(g, { project: 'JOB', urgency: 1, form: 'quantity', kind: 'applied', done: 4, of: 10, metToday: false });
  assert.equal(goalLabel(g), 'JOB 4/10 applied');
  const today = goalProgress(project({ quantity: 10, kind: 'applied' }), [], [...logs, log(THU, { kind: 'applied', count: 2 })], new Set(), THU)!;
  assert.equal(goalLabel(today), 'JOB 6/10 applied ✓');
  assert.equal(today.urgency, 2);
});

test('target: scope is open issues plus those done since it was set; ideas and dropped are out', () => {
  const goal = { target: '2026-10-19', set: '2026-10-05' };
  const issues = [
    issue('todo'),
    issue('doing'),
    issue('idea'),
    issue('dropped'),
    issue('done', { transitions: doneAt('2026-10-06T10:00') }),
    issue('done', { transitions: doneAt('2026-10-05T02:00') }),
    issue('done', { updated: '2026-10-07' }),
    issue('done', { updated: '2026-10-01' }),
    issue('todo', { project: 'PORT', id: 'PORT-1' }),
  ];
  const g = goalProgress(project(goal), issues, [], new Set(), THU)!;
  assert.deepEqual(g, { project: 'JOB', urgency: 2, form: 'target', date: '2026-10-19', state: 'ontrack', scope: 4, left: 2, daysLeft: 11 });
});

test('target: on track while what is left fits the time left, rounded up', () => {
  const goal = { target: '2026-10-19', set: '2026-10-05' };
  const open = Array.from({ length: 6 }, () => issue('todo'));
  const g = (day: string, done = 0) =>
    target(project(goal), [...open.slice(done), ...open.slice(0, done).map((t) => ({ ...t, status: 'done' as const, transitions: doneAt(`${day}T10:00`) }))], [], new Set(), day);
  assert.equal(goalLabel(g('2026-10-05')), 'JOB 6 left ▲14d');
  assert.equal(g('2026-10-05').urgency, 2);
  // 14 days for 6: by day 7 (7 left) ceil(6 * 7/14) = 3 may remain.
  assert.equal(g('2026-10-12', 3).state, 'ontrack');
  assert.equal(goalLabel(g('2026-10-12', 2)), 'JOB 4 left ▲7d, behind');
  assert.equal(goalLabel(g('2026-10-19', 5)), 'JOB 1 left ▲today, behind');
  assert.equal(goalLabel(g('2026-10-19', 6)), 'JOB done ✓');
});

test('target: overdue once the date passes with issues open; no scope when nothing is committed', () => {
  const goal = { target: '2026-10-19', set: '2026-10-05' };
  const late = target(project(goal), [issue('todo'), issue('doing')], [], new Set(), '2026-10-21');
  assert.equal(late.state, 'overdue');
  assert.equal(late.urgency, 0);
  assert.equal(goalLabel(late), 'JOB 2 left, overdue 2d');
  const empty = target(project(goal), [issue('idea')], [], new Set(), THU);
  assert.equal(empty.state, 'noscope');
  assert.equal(empty.urgency, 2);
  assert.equal(goalLabel(empty), 'JOB no scope');
});

test('target: due today with issues open is behind', () => {
  const g = target(project({ target: THU, set: THU }), [issue('todo')], [], new Set(), THU);
  assert.equal(g.state, 'behind');
  assert.equal(goalLabel(g), 'JOB 1 left ▲today, behind');
});

test('goalSpec describes the goal itself', () => {
  assert.equal(goalSpec({ habit: 5 }), '5 days/wk');
  assert.equal(goalSpec({ quantity: 10, kind: 'applied' }), '10 applied/wk');
  assert.equal(goalSpec({ target: '2026-10-19', set: '2026-10-05' }), 'by 2026-10-19');
});

test('goalsProgress: every counting goal in project order, commits moving habits', () => {
  const projects = [
    project({ habit: 2 }),
    project({ habit: 1 }, { key: 'OFF', focus: false }),
    project({ quantity: 10, kind: 'applied' }, { key: 'APP' }),
    project({ target: '2026-10-19', set: '2026-10-05' }, { key: 'PORT' }),
  ];
  const issues = [issue('todo', { project: 'PORT', id: 'PORT-1' })];
  const logs = [log(THU, { project: 'APP', kind: 'applied', count: 6 })];
  const goals = goalsProgress(projects, issues, logs, { JOB: [THU] }, THU);
  assert.equal(goalStrip(goals), 'JOB 1/2 ✓ · APP 6/10 applied ✓ · PORT 1 left ▲11d');
  assert.deepEqual([...urgencies(goals)], [['JOB', 2], ['APP', 2], ['PORT', 2]]);
  assert.equal(goalStrip(goalsProgress(projects, issues, [], {}, THU)), 'JOB 0/2 · APP 0/10 applied · PORT 1 left ▲11d');
});

test('parseGoalSpec reads goalSpec back', () => {
  for (const g of [{ habit: 5 }, { quantity: 10, kind: 'applied' }, { target: '2026-10-19', set: '2026-10-05' }] as Goal[]) {
    const { set: _, ...input } = g as Goal & { set?: string };
    assert.deepEqual(parseGoalSpec(goalSpec(g)), input);
  }
  assert.deepEqual(parseGoalSpec(' 3 '), { habit: 3 });
  assert.deepEqual(parseGoalSpec('1 day'), { habit: 1 });
  assert.deepEqual(parseGoalSpec('4 Outreach'), { quantity: 4, kind: 'outreach' });
  assert.deepEqual(parseGoalSpec('2026-11-01'), { target: '2026-11-01' });
  assert.equal(parseGoalSpec(''), null);
  assert.equal(parseGoalSpec('None'), null);
  assert.throws(() => parseGoalSpec('lots'), /goal must be/);
  assert.throws(() => parseGoalSpec('by friday'), /goal must be/);
});

test('burndown: issues left per day since the target was set, with scope added on creation', () => {
  const p = project({ target: '2026-10-10', set: '2026-10-05' });
  const issues = [
    issue('done', { transitions: doneAt('2026-10-06T15:00') }),
    issue('done', { transitions: doneAt('2026-10-03T15:00') }),
    issue('doing'),
    issue('todo', { created: '2026-10-07' }),
    issue('idea'),
  ];
  assert.deepEqual(burndown(p, issues, THU), [
    { day: '2026-10-05', left: 2 },
    { day: '2026-10-06', left: 1 },
    { day: '2026-10-07', left: 2 },
    { day: '2026-10-08', left: 2 },
  ]);
  assert.equal(burndown(p, issues, '2026-10-20').length, 6);
  assert.deepEqual(burndown(project({ habit: 3 }), issues, THU), []);
});
