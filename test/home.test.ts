import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GrillSession } from '../src/grill.ts';
import { activity, activityGrid, doingSince, IDLE_DAYS, inFlight, lastTouch } from '../src/home.ts';
import type { DatedEntry } from '../src/logs.ts';
import type { Issue, IssueStatus, Project } from '../src/store.ts';

const project = (key: string, over: Partial<Project> = {}): Project => ({ key, name: key, paths: [], status: 'active', focus: false, body: '', ...over });

const issue = (id: string, over: Partial<Issue> = {}): Issue => ({
  id,
  title: `Issue ${id}`,
  project: id.replace(/-\d+$/, ''),
  status: 'doing',
  blocked_by: [],
  source: 'user',
  created: '2026-09-01',
  updated: '2026-09-01',
  comments: [],
  body: '',
  ...over,
});

const entry = (day: string, over: Partial<DatedEntry> = {}): DatedEntry => ({ project: 'BEL', at: `${day}T12:00`, by: 'user', text: 'did a thing', day, n: 1, ...over });

const started = (at: string) => [
  { at: '2026-09-01T10:00', to: 'todo' as const, by: 'user' as const },
  { at, from: 'todo' as const, to: 'doing' as const, by: 'user' as const },
];

const TODAY = '2026-10-06';

test('lastTouch: latest transition, comment or linked log entry; ignores updated and other issues', () => {
  const t = issue('BEL-1', {
    updated: '2026-10-05',
    transitions: started('2026-10-01T09:00'),
    comments: [{ at: '2026-10-02T09:00', by: 'user', text: 'x' }],
  });
  assert.equal(lastTouch(t, []), '2026-10-02T09:00');
  assert.equal(lastTouch(t, [entry('2026-10-03', { issue: 'BEL-1' }), entry('2026-10-04', { issue: 'BEL-2' })]), '2026-10-03T12:00');
  assert.equal(lastTouch(issue('BEL-3'), []), undefined);
});

test('doingSince: last move to doing, else updated', () => {
  assert.equal(doingSince(issue('BEL-1', { transitions: started('2026-10-02T03:00') })), '2026-10-01');
  assert.equal(doingSince(issue('BEL-1', { updated: '2026-10-04' })), '2026-10-04');
});

test('inFlight: idle from IDLE_DAYS work days, counting the 4am edge', () => {
  const at = (day: string, time: string) => issue('BEL-1', { transitions: started(`${day}T${time}`) });
  const row = (t: Issue) => inFlight([project('BEL')], [t], [], [], TODAY).issues[0];
  assert.equal(IDLE_DAYS, 3);
  assert.equal(row(at('2026-10-04', '10:00')).idleDays, undefined);
  assert.equal(row(at('2026-10-03', '10:00')).idleDays, 3);
  // 03:30 on the 4th still counts toward the 3rd
  assert.equal(row(at('2026-10-04', '03:30')).idleDays, 3);
  assert.equal(row(at('2026-10-04', '04:00')).idleDays, undefined);
});

test('inFlight: commits and updated do not keep an issue busy, comments and log entries do', () => {
  const t = issue('BEL-1', { updated: TODAY, transitions: started('2026-09-28T10:00') });
  assert.equal(inFlight([project('BEL')], [t], [], [], TODAY).issues[0].idleDays, 8);
  const commented = { ...t, comments: [{ at: '2026-10-05T10:00', by: 'claude' as const, text: 'x' }] };
  assert.equal(inFlight([project('BEL')], [commented], [], [], TODAY).issues[0].idleDays, undefined);
  assert.equal(inFlight([project('BEL')], [t], [entry('2026-10-05', { issue: 'BEL-1' })], [], TODAY).issues[0].idleDays, undefined);
});

test('inFlight: active projects only, idle first then most recent activity', () => {
  const projects = [project('BEL'), project('OLD', { status: 'paused' })];
  const issues = [
    issue('BEL-1', { transitions: started('2026-10-04T10:00') }),
    issue('BEL-2', { transitions: started('2026-10-05T10:00') }),
    issue('BEL-3', { transitions: started('2026-09-20T10:00') }),
    issue('OLD-1'),
  ];
  const { issues: rows } = inFlight(projects, issues, [], [], TODAY);
  assert.deepEqual(rows.map((r) => r.issue.id), ['BEL-3', 'BEL-2', 'BEL-1']);
});

test('inFlight: grill sessions in progress, tagged and not yet linked', () => {
  const g = (slug: string, over: Partial<GrillSession> = {}): GrillSession => ({ slug, topic: '', status: 'in-progress', project: 'bel', ...over });
  const sessions = [g('open'), g('linked'), g('untagged', { project: undefined }), g('planned', { status: 'planned' })];
  const { grill } = inFlight([project('BEL')], [issue('BEL-1', { status: 'todo', grill: 'linked' })], [], sessions, TODAY);
  assert.deepEqual(grill.map((s) => [s.slug, s.project]), [['open', 'BEL']]);
});

test('activity: each issue once, at its latest move to doing/done/dropped in the window, plus log entries, newest first', () => {
  const t = issue('BEL-1', {
    transitions: [
      { at: '2026-10-05T09:00', to: 'idea', by: 'user' },
      { at: '2026-10-05T10:00', from: 'idea', to: 'todo', by: 'user' },
      { at: '2026-10-05T11:00', from: 'todo', to: 'doing', by: 'user' },
      { at: '2026-10-06T10:00', from: 'doing', to: 'done', by: 'claude' },
      { at: '2026-10-07T09:00', from: 'done', to: 'todo', by: 'user' },
    ],
  });
  const logs = [entry('2026-10-05', { at: '2026-10-05T15:00' }), entry('2026-10-05', { at: '2026-10-06T09:00', n: 2 })];
  const events = (from: string, to: string) =>
    activity([project('BEL')], [t], logs, from, to).flatMap((d) => ('day' in d ? d.events : [])).map((e) => (e.type === 'log' ? `log ${e.at}` : `${e.to} ${e.at}`));
  assert.deepEqual(events('2026-10-05', '2026-10-07'), ['done 2026-10-06T10:00', 'log 2026-10-06T09:00', 'log 2026-10-05T15:00']);
  assert.deepEqual(events('2026-10-05', '2026-10-05').filter((e) => !e.startsWith('log')), ['doing 2026-10-05T11:00']);
});

test('activity: empty runs collapse, archived projects and days outside the window are left out', () => {
  const projects = [project('BEL'), project('OLD', { status: 'archived' })];
  const logs = [entry('2026-09-29'), entry('2026-10-01'), entry('2026-10-05'), entry('2026-10-06', { project: 'OLD' }), entry('2026-09-28')];
  const days = activity(projects, [], logs, '2026-09-29', TODAY);
  assert.deepEqual(
    days.map((d) => ('gap' in d ? `${d.gap.from}..${d.gap.to}` : d.day)),
    ['2026-10-06..2026-10-06', '2026-10-05', '2026-10-02..2026-10-04', '2026-10-01', '2026-09-30..2026-09-30', '2026-09-29'],
  );
});

test('activity: scoped to one project, archived or not', () => {
  const projects = [project('BEL'), project('OLD', { status: 'archived' })];
  const moved = (id: string) => issue(id, { status: 'done', transitions: [{ at: '2026-10-05T10:00', from: 'doing', to: 'done', by: 'user' }] });
  const logs = [entry('2026-10-05'), entry('2026-10-06', { project: 'OLD' })];
  const events = (key: string) =>
    activity(projects, [moved('BEL-1'), moved('OLD-1')], logs, '2026-10-05', TODAY, { project: key })
      .flatMap((d) => ('day' in d ? d.events : []))
      .map((e) => (e.type === 'log' ? `log ${e.entry.project}` : e.issue.id));
  assert.deepEqual(events('BEL'), ['log BEL', 'BEL-1']);
  assert.deepEqual(events('OLD'), ['log OLD', 'OLD-1']);
});

test('activity: doneOnly keeps moves to done, drops log entries, and merges the emptied days into gaps', () => {
  const projects = [project('BEL'), project('OLD', { status: 'archived' })];
  const moves = (id: string, ...steps: [string, IssueStatus, IssueStatus][]) =>
    issue(id, { transitions: steps.map(([at, from, to]) => ({ at, from, to, by: 'user' as const })) });
  const issues = [
    moves('BEL-1', ['2026-10-02T10:00', 'todo', 'doing'], ['2026-10-03T10:00', 'doing', 'done'], ['2026-10-05T10:00', 'done', 'doing']),
    moves('BEL-2', ['2026-10-04T10:00', 'todo', 'doing']),
    moves('BEL-3', ['2026-10-06T09:00', 'doing', 'dropped']),
    moves('OLD-1', ['2026-10-04T10:00', 'doing', 'done']),
  ];
  const logs = [entry('2026-10-04'), entry('2026-10-05')];
  const days = activity(projects, issues, logs, '2026-10-01', TODAY, { doneOnly: true });
  assert.deepEqual(
    days.map((d) => ('gap' in d ? `${d.gap.from}..${d.gap.to}` : `${d.day} ${d.events.map((e) => (e.type === 'transition' ? `${e.issue.id} ${e.to}` : 'log')).join()}`)),
    ['2026-10-04..2026-10-06', '2026-10-03 BEL-1 done', '2026-10-01..2026-10-02'],
  );
});

const doneAt = (id: string, at: string, over: Partial<Issue> = {}) =>
  issue(id, { status: 'done', transitions: [{ at: '2026-09-01T10:00', to: 'todo', by: 'user' }, { at, from: 'todo', to: 'done', by: 'user' }], ...over });

test('activityGrid: last week and this week, Sunday first, days after today future', () => {
  const grid = activityGrid([project('BEL')], [], [], TODAY);
  assert.equal(grid.length, 14);
  assert.equal(grid[0].day, '2026-09-27');
  assert.equal(grid[13].day, '2026-10-10');
  assert.deepEqual(grid.filter((d) => d.future).map((d) => d.day), ['2026-10-07', '2026-10-08', '2026-10-09', '2026-10-10']);
  assert.ok(grid.every((d) => d.level === 0));
  assert.equal(activityGrid([project('BEL')], [], [], '2026-10-04')[0].day, '2026-09-27');
});

test('activityGrid: moves to done by transition, a source weighted five, levels against the busiest day', () => {
  const issues = [
    doneAt('BEL-1', '2026-10-05T10:00'),
    doneAt('BEL-2', '2026-10-05T11:00'),
    doneAt('BEL-3', '2026-10-06T03:00'),
    // updated on a grid day, but its move to done is before the grid
    doneAt('BEL-4', '2026-09-20T10:00', { updated: '2026-10-06' }),
    issue('BEL-5', { status: 'doing', transitions: started('2026-10-06T10:00') }),
  ];
  const lessons = { days: ['2026-10-06', '2026-10-06', '2026-09-28'], weight: 5, unit: ['lesson', 'lessons'] as [string, string] };
  const grid = new Map(activityGrid([project('BEL')], issues, [lessons], TODAY).map((d) => [d.day, d]));
  assert.deepEqual(grid.get('2026-10-05'), { day: '2026-10-05', done: 3, extra: [{ n: 0, noun: 'lessons' }], level: 2, future: false });
  assert.deepEqual(grid.get('2026-10-06'), { day: '2026-10-06', done: 0, extra: [{ n: 2, noun: 'lessons' }], level: 4, future: false });
  assert.deepEqual(grid.get('2026-09-28'), { day: '2026-09-28', done: 0, extra: [{ n: 1, noun: 'lesson' }], level: 2, future: false });
  assert.equal(grid.get('2026-10-01')!.level, 0);
});

test('activityGrid: archived projects skipped, an issue counted once a day', () => {
  const twice = issue('BEL-1', {
    status: 'done',
    transitions: [
      { at: '2026-10-05T10:00', from: 'doing', to: 'done', by: 'user' },
      { at: '2026-10-05T11:00', from: 'done', to: 'doing', by: 'user' },
      { at: '2026-10-05T12:00', from: 'doing', to: 'done', by: 'user' },
    ],
  });
  const projects = [project('BEL'), project('OLD', { status: 'archived' })];
  const grid = activityGrid(projects, [twice, doneAt('OLD-1', '2026-10-05T10:00')], [], TODAY);
  assert.equal(grid.find((d) => d.day === '2026-10-05')!.done, 1);
});
