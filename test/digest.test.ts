import assert from 'node:assert/strict';
import { test } from 'node:test';
import { digestLines } from '../src/digest.ts';
import type { Session } from '../src/history.ts';
import type { Project, Issue } from '../src/store.ts';

const project: Project = {
  key: 'ELV',
  name: 'Rideable Elevators',
  paths: [],
  status: 'active',
  focus: true,
  body: '',
};

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

test('digestLines', () => {
  const issues = [
    issue('ELV-1', { status: 'doing' }),
    issue('ELV-2', { created: '2026-09-01' }),
    issue('ELV-3', { priority: 'high', created: '2026-10-02' }),
    issue('ELV-4', { blocked_by: ['ELV-1'] }),
    issue('ELV-5', { status: 'idea' }),
    issue('OTH-1'),
  ];
  const sessions: Session[] = [
    {
      id: 's',
      cwd: '',
      title: 'Call button light',
      start: '2026-09-26T19:00:00Z',
      end: '2026-09-26T19:30:00Z',
      commits: [{ hash: 'abc', time: '', subject: '' }],
    },
  ];
  const lines = digestLines(project, issues, sessions);
  assert.equal(lines[0], 'belay: ELV — Rideable Elevators (focus)');
  assert.equal(lines[1], 'doing: ELV-1 Issue ELV-1');
  assert.equal(lines[2], 'ready 2 (1 idea): ELV-3 Issue ELV-3; ELV-2 Issue ELV-2');
  assert.match(lines[3], /^recent: 09-2[67] Call button light \(1 commit\)$/);
  assert.equal(lines.length, 4);
});

test('digestLines: quiet project', () => {
  assert.deepEqual(digestLines({ ...project, focus: false, status: 'paused' }, [], []), [
    'belay: ELV — Rideable Elevators (paused)',
    'ready: none',
  ]);
});

test('digestLines: bad files after ready, at most two', () => {
  const bad = [
    { file: 'issues/elv-7.md', error: 'line 4: Nested mappings are not allowed in compact mappings, really' },
    { file: 'issues/elv-8.md', error: 'missing frontmatter' },
    { file: 'projects/oth.md', error: "'name' must be a non-empty string" },
  ];
  const lines = digestLines(project, [issue('ELV-1')], [], { bad });
  assert.equal(lines[2], 'bad files: issues/elv-7.md (line 4: Nested mappings are not allowed in compact mappings…); issues/elv-8.md (missing frontmatter); …');
  assert.equal(digestLines(project, [issue('ELV-1')], [], { bad: bad.slice(1, 2) })[2], 'bad files: issues/elv-8.md (missing frontmatter)');
  assert.equal(digestLines(project, [issue('ELV-1')], []).length, 2);
});

test('digestLines: doing shows the 3 oldest, counted only past 3', () => {
  const doing = (n: number) => Array.from({ length: n }, (_, i) => issue(`ELV-${i + 1}`, { status: 'doing', created: `2026-09-0${9 - i}` }));
  assert.equal(digestLines(project, doing(3), [])[1], 'doing: ELV-3 Issue ELV-3; ELV-2 Issue ELV-2; ELV-1 Issue ELV-1');
  assert.equal(digestLines(project, doing(4), [])[1], 'doing 4: ELV-4 Issue ELV-4; ELV-3 Issue ELV-3; ELV-2 Issue ELV-2; …');
});

test('digestLines: compact keeps header, doing, ready and bad files', () => {
  const issues = [issue('ELV-1', { status: 'doing' }), issue('ELV-2')];
  const sessions: Session[] = [{ id: 's', cwd: '', title: 'Call button', start: '2026-09-26T19:00:00Z', end: '2026-09-26T19:30:00Z' }];
  const bad = [{ file: 'issues/elv-8.md', error: 'missing frontmatter' }];
  assert.equal(digestLines(project, issues, sessions, { bad }).length, 5);
  assert.deepEqual(digestLines(project, issues, sessions, { bad, compact: true }), [
    'belay: ELV — Rideable Elevators (focus)',
    'doing: ELV-1 Issue ELV-1',
    'ready 1: ELV-2 Issue ELV-2',
    'bad files: issues/elv-8.md (missing frontmatter)',
  ]);
});
