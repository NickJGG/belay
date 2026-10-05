import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { DatedEntry } from '../src/logs.ts';
import { commitDays, movedDays } from '../src/moved.ts';
import type { Issue, Project } from '../src/store.ts';

const project: Project = { key: 'JOB', name: 'Job search', paths: [], status: 'active', focus: true, body: '' };

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

const log = (day: string, over: Partial<DatedEntry> = {}): DatedEntry => ({ project: 'JOB', at: `${day}T12:00`, by: 'user', text: 'x', day, n: 1, ...over });

const sorted = (s: Set<string>) => [...s].sort();

test('transitions, comments, log entries and commits each move a project, on their work day', () => {
  const issues = [
    issue({
      transitions: [
        { at: '2026-10-01T09:00', to: 'todo', by: 'user' },
        { at: '2026-10-03T02:30', from: 'todo', to: 'doing', by: 'claude' },
      ],
      comments: [{ at: '2026-10-04T20:00', by: 'user', text: 'c' }],
    }),
  ];
  const logs = [log('2026-10-06', { at: '2026-10-08T09:00' })];
  assert.deepEqual(sorted(movedDays(project, issues, logs, ['2026-10-07'])), ['2026-10-01', '2026-10-02', '2026-10-04', '2026-10-06', '2026-10-07']);
});

test("other projects' activity doesn't count, and issues without transitions only count comments", () => {
  const issues = [
    issue({ id: 'PORT-1', project: 'PORT', comments: [{ at: '2026-10-04T20:00', by: 'user', text: 'c' }] }),
    issue({ status: 'done', updated: '2026-10-05' }),
  ];
  assert.deepEqual(sorted(movedDays(project, issues, [log('2026-10-05', { project: 'PORT' })], [])), []);
});

test('commitDays maps git commit times to distinct work days', () => {
  const t = (h: number, d = 6) => new Date(2026, 9, d, h, 30).toISOString();
  assert.deepEqual(commitDays([t(1), t(10), t(23), t(3, 7)]), ['2026-10-05', '2026-10-06']);
});
