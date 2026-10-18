import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { GoalProgress } from '../src/goals.ts';
import { statusLine, withBad, withGoals } from '../src/statusline.ts';
import type { Issue, Project } from '../src/store.ts';

const project: Project = { key: 'ELV', name: 'Rideable Elevators', paths: [], status: 'active', focus: true, body: '' };

const issue = (id: string, over: Partial<Issue> = {}): Issue => ({
  id,
  title: `Issue ${id}`,
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

const plain = (s: string) => s.replace(/\x1b\[[0-9;]*m|\x1b\]8;;[^\x07]*\x07/g, '');
const line = (issues: Issue[]) => plain(statusLine(project, issues));

test('doing issue wins over ready ones', () => {
  const issues = [issue('ELV-1', { status: 'doing' }), issue('ELV-2'), issue('ELV-3', { status: 'idea' }), issue('FRG-1')];
  assert.equal(line(issues), '▶ ELV-1 Issue ELV-1');
});

test('more doing issues show as +n, most recently updated first', () => {
  const issues = [issue('ELV-1', { status: 'doing' }), issue('ELV-2', { status: 'doing', updated: '2026-10-03' })];
  assert.equal(line(issues), '▶ ELV-2 Issue ELV-2 +1');
});

test('doing issues updated the same day fall back to oldest', () => {
  const issues = [issue('ELV-2', { status: 'doing', created: '2026-09-30' }), issue('ELV-1', { status: 'doing' })];
  assert.equal(line(issues), '▶ ELV-2 Issue ELV-2 +1');
});

test('blocked doing issue gets a marker', () => {
  const issues = [issue('ELV-1', { status: 'doing', blocked_by: ['ELV-2'] }), issue('ELV-2', { status: 'idea' })];
  assert.equal(line(issues), '▶ ELV-1 Issue ELV-1 ⛔');
});

test('nothing doing shows the next ready issue, high priority first', () => {
  const issues = [issue('ELV-1'), issue('ELV-2', { priority: 'high' }), issue('ELV-3', { blocked_by: ['ELV-1'] })];
  assert.equal(line(issues), 'next: ELV-2 Issue ELV-2');
});

test('the issue ID links to its dashboard page', () => {
  const link = '\x1b]8;;http://127.0.0.1:4747/i/ELV-1\x07ELV-1\x1b]8;;\x07';
  assert.ok(statusLine(project, [issue('ELV-1', { status: 'doing' })]).includes(link));
  assert.ok(statusLine(project, [issue('ELV-1')]).includes(link));
});

test('empty when there is nothing to show', () => {
  assert.equal(statusLine(project, [issue('ELV-1', { status: 'done' }), issue('ELV-2', { status: 'idea' }), issue('FRG-1', { status: 'doing' })]), '');
});

test('withGoals appends the goal strip, or stands alone outside a project', () => {
  const goals: GoalProgress[] = [
    { project: 'JOB', urgency: 1, form: 'quantity', kind: 'applied', done: 6, of: 10, metToday: false },
    { project: 'PORT', urgency: 2, form: 'target', date: '2026-10-19', state: 'ontrack', scope: 8, left: 6, daysLeft: 10 },
  ];
  assert.equal(withGoals('▶ ELV-1', goals), '▶ ELV-1 │ JOB 6/10 applied · PORT 6 left ▲10d');
  assert.equal(withGoals('', goals), 'JOB 6/10 applied · PORT 6 left ▲10d');
  assert.equal(withGoals('▶ ELV-1', []), '▶ ELV-1');
  assert.equal(withGoals('', []), '');
});

test('withBad appends a bad-file count when there is one', () => {
  assert.equal(withBad('▶ ELV-1', 0), '▶ ELV-1');
  assert.equal(withBad('▶ ELV-1', 1), '▶ ELV-1 │ ⚠ 1 bad file');
  assert.equal(withBad('', 3), '⚠ 3 bad files');
});
