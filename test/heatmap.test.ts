import assert from 'node:assert/strict';
import { test } from 'node:test';
import { heatLevel, heatmap, heatRange, moves } from '../src/heatmap.ts';
import type { DatedEntry } from '../src/logs.ts';
import type { Issue, Project } from '../src/store.ts';

const project = (key: string): Project => ({ key, name: key, paths: [], status: 'active', focus: false, body: '' });

const issue = (over: Partial<Issue> = {}): Issue => ({
  id: 'JOB-1',
  title: 'x',
  project: 'JOB',
  status: 'todo',
  blocked_by: [],
  source: 'user',
  created: '2026-09-01',
  updated: '2026-09-01',
  comments: [],
  body: '',
  ...over,
});

const log = (project: string, day: string): DatedEntry => ({ project, at: `${day}T12:00`, by: 'user', text: 'x', day, n: 1 });

// 2026-10-08 is a Thursday.
const THU = '2026-10-08';

test('moves counts each transition, comment, log entry and commit on its work day', () => {
  const issues = [
    issue({
      transitions: [
        { at: '2026-10-06T10:00', to: 'todo', by: 'user' },
        { at: '2026-10-07T03:00', from: 'todo', to: 'doing', by: 'user' },
      ],
      comments: [{ at: '2026-10-06T11:00', by: 'user', text: 'c' }],
    }),
    issue({ id: 'PORT-1', project: 'PORT', comments: [{ at: '2026-10-06T11:00', by: 'user', text: 'c' }] }),
  ];
  const logs = [log('JOB', '2026-10-05'), log('PORT', '2026-10-05')];
  const commits = [new Date(2026, 9, 5, 2).toISOString()];
  assert.deepEqual([...moves(project('JOB'), issues, logs, commits)].sort(), [
    ['2026-10-04', 1],
    ['2026-10-05', 1],
    ['2026-10-06', 3],
  ]);
});

test('heatmap: weeks back from this Monday, future days null, last moved may predate the range', () => {
  assert.deepEqual(heatRange(THU, 2), { from: '2026-09-28', to: '2026-10-11' });
  const logs = [log('JOB', '2026-09-28'), log('JOB', THU), log('JOB', THU), log('OLD', '2026-08-01')];
  const h = heatmap([project('JOB'), project('OLD'), project('NEW')], [], logs, {}, THU, 2);
  assert.equal(h.days.length, 14);
  assert.equal(h.days[0], '2026-09-28');
  const [job, old, none] = h.rows;
  assert.deepEqual(job.counts, [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 2, null, null, null]);
  assert.equal(job.lastMoved, THU);
  assert.deepEqual(old.counts.slice(0, 11), Array(11).fill(0));
  assert.equal(old.lastMoved, '2026-08-01');
  assert.equal(none.lastMoved, undefined);
});

test('heatLevel buckets moves into five shades', () => {
  assert.deepEqual([0, 1, 2, 3, 4, 6, 7, 20].map(heatLevel), [0, 1, 2, 2, 3, 3, 4, 4]);
});
