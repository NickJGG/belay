import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GrillSession } from '../src/grill.ts';
import { doingSince, IDLE_DAYS, inFlight, issueActivity, timeline } from '../src/home.ts';
import type { DatedEntry } from '../src/logs.ts';
import type { Issue, Project } from '../src/store.ts';

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

test('issueActivity: latest transition, comment or linked log entry; ignores updated and other issues', () => {
  const t = issue('BEL-1', {
    updated: '2026-10-05',
    transitions: started('2026-10-01T09:00'),
    comments: [{ at: '2026-10-02T09:00', by: 'user', text: 'x' }],
  });
  assert.equal(issueActivity(t, []), '2026-10-02T09:00');
  assert.equal(issueActivity(t, [entry('2026-10-03', { issue: 'BEL-1' }), entry('2026-10-04', { issue: 'BEL-2' })]), '2026-10-03T12:00');
  assert.equal(issueActivity(issue('BEL-3'), []), undefined);
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

test('timeline: each issue once, at its latest move to doing/done/dropped in the window, plus log entries, newest first', () => {
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
    timeline([project('BEL')], [t], logs, from, to).flatMap((d) => ('day' in d ? d.events : [])).map((e) => (e.type === 'log' ? `log ${e.at}` : `${e.to} ${e.at}`));
  assert.deepEqual(events('2026-10-05', '2026-10-07'), ['done 2026-10-06T10:00', 'log 2026-10-06T09:00', 'log 2026-10-05T15:00']);
  assert.deepEqual(events('2026-10-05', '2026-10-05').filter((e) => !e.startsWith('log')), ['doing 2026-10-05T11:00']);
});

test('timeline: empty runs collapse, archived projects and days outside the window are left out', () => {
  const projects = [project('BEL'), project('OLD', { status: 'archived' })];
  const logs = [entry('2026-09-29'), entry('2026-10-01'), entry('2026-10-05'), entry('2026-10-06', { project: 'OLD' }), entry('2026-09-28')];
  const days = timeline(projects, [], logs, '2026-09-29', TODAY);
  assert.deepEqual(
    days.map((d) => ('gap' in d ? `${d.gap.from}..${d.gap.to}` : d.day)),
    ['2026-10-06..2026-10-06', '2026-10-05', '2026-10-02..2026-10-04', '2026-10-01', '2026-09-30..2026-09-30', '2026-09-29'],
  );
});
