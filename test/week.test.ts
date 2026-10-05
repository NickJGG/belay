import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DatedEntry } from '../src/logs.ts';
import type { Issue, Project } from '../src/store.ts';
import { weekLines, weekSummary } from '../src/week.ts';

const project = (key: string, over: Partial<Project> = {}): Project => ({ key, name: key, paths: [], status: 'active', focus: false, body: '', ...over });

const issue = (id: string, over: Partial<Issue> = {}): Issue => ({
  id,
  title: id,
  project: id.replace(/-\d+$/, ''),
  status: 'done',
  blocked_by: [],
  source: 'user',
  created: '2026-09-01',
  updated: '2026-09-01',
  comments: [],
  body: '',
  ...over,
});

const log = (project: string, day: string, over: Partial<DatedEntry> = {}): DatedEntry => ({ project, at: `${day}T12:00`, by: 'user', text: 'x', day, n: 1, ...over });

// 2026-10-05 is a Monday.
const WEEK = '2026-10-05';
const THU = '2026-10-08';

test('weekSummary: moved days, done issues, commits and log kinds per project', () => {
  const projects = [
    project('JOB', { focus: true, kinds: ['applied', 'outreach'], goal: { quantity: 10, kind: 'applied' } }),
    project('TRK'),
    project('IDLE'),
    project('PORT', { focus: true, goal: { habit: 3 } }),
  ];
  const issues = [
    issue('TRK-2', { transitions: [{ at: '2026-10-06T10:00', from: 'doing', to: 'done', by: 'user' }] }),
    issue('TRK-1', { transitions: [{ at: '2026-10-07T03:00', from: 'doing', to: 'done', by: 'user' }] }),
    issue('TRK-3', { transitions: [{ at: '2026-10-05T03:59', from: 'doing', to: 'done', by: 'user' }] }),
    issue('TRK-4', { status: 'todo', transitions: [{ at: '2026-10-06T10:00', from: 'done', to: 'todo', by: 'user' }] }),
    issue('IDLE-1', { updated: '2026-10-06' }),
  ];
  const logs = [
    log('JOB', WEEK, { kind: 'outreach' }),
    log('JOB', WEEK, { kind: 'applied', count: 4 }),
    log('JOB', '2026-10-07', { kind: 'applied', count: 2 }),
    log('JOB', '2026-10-07', { text: 'note' }),
  ];
  const commits = { TRK: ['2026-10-06T15:00:00-04:00', '2026-10-06T16:00:00-04:00'] };
  const rows = weekSummary(projects, issues, logs, commits, WEEK, THU);
  assert.deepEqual(rows.map((r) => r.project), ['JOB', 'TRK', 'PORT']);
  const [job, trk, port] = rows;
  assert.deepEqual(job.moved, [true, false, true, false, null, null, null]);
  assert.deepEqual(job.kinds, [{ kind: 'applied', count: 6 }, { kind: 'outreach', count: 1 }]);
  assert.equal(job.notes, 1);
  assert.equal(job.goal?.form, 'quantity');
  assert.deepEqual(trk.done, ['TRK-1', 'TRK-2']);
  assert.equal(trk.commits, 2);
  assert.deepEqual(trk.moved, [false, true, false, false, null, null, null]);
  assert.deepEqual(port.moved, [false, false, false, false, null, null, null]);
  assert.deepEqual(weekLines(rows, WEEK), [
    'week of 2026-10-05 – 2026-10-11',
    '  JOB   ●○●○···  6/10 applied · logged applied 6, outreach 1, 1 note',
    '  TRK   ○●○○···  done TRK-1, TRK-2 · 2 commits',
    '  PORT  ○○○○···  0/3 days',
  ]);
});

test('weekSummary: a past week shows every day and reached goals, but no target', () => {
  const projects = [
    project('JOB', { focus: true, goal: { habit: 2 } }),
    project('PORT', { focus: true, goal: { target: '2026-10-19', set: '2026-10-01' } }),
  ];
  const logs = [log('JOB', '2026-09-29'), log('JOB', '2026-10-04')];
  const rows = weekSummary(projects, [], logs, {}, '2026-09-28', THU);
  assert.deepEqual(weekLines(rows, '2026-09-28'), ['week of 2026-09-28 – 2026-10-04', '  JOB  ○●○○○○●  2/2 days ✓ · logged 2 notes']);
  assert.deepEqual(weekLines([], WEEK), ['week of 2026-10-05 – 2026-10-11', '  nothing moved']);
});
