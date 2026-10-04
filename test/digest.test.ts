import assert from 'node:assert/strict';
import { test } from 'node:test';
import { digestLines } from '../src/digest.ts';
import { grillForProject, grillMatches, grillMentions, projectTerms, type GrillSession } from '../src/grill.ts';
import type { Session } from '../src/history.ts';
import type { Project, Task } from '../src/store.ts';

const project: Project = {
  key: 'pz-elevators',
  name: 'Rideable Elevators',
  paths: [],
  status: 'active',
  focus: true,
  body: '',
};

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  project: id.replace(/-\d+$/, ''),
  status: 'todo',
  blocked_by: [],
  source: 'user',
  created: '2026-10-01',
  updated: '2026-10-01',
  body: '',
  ...over,
});

const grill = (slug: string, topic = '', over: Partial<GrillSession> = {}): GrillSession => ({ slug, topic, ...over });

test('projectTerms: 5+ letter words, singularized', () => {
  assert.deepEqual(projectTerms(project), ['elevator', 'rideable']);
  assert.deepEqual(projectTerms({ ...project, key: 'pz-fridges', name: 'Turn off Fridges' }), ['fridge']);
});

test('grillMentions matches word starts only', () => {
  assert.ok(grillMentions(grill('elevator-call-button'), 'elevator'));
  assert.ok(grillMentions(grill('x', 'Nick\'s Rideable Elevators — call'), 'elevator'));
  assert.ok(!grillMentions(grill('bloodhound', 'returns with a pin'), 'turn'));
});

test('grillForProject: tags win over term matching', () => {
  const sessions = [
    grill('tagged', 'anything', { project: 'pz-elevators' }),
    grill('elevator-other-project', '', { project: 'pz-fridges' }),
    grill('elevator-untagged'),
    grill('unrelated'),
  ];
  const { tagged, matched } = grillForProject(sessions, project);
  assert.deepEqual(tagged.map((g) => g.slug), ['tagged']);
  assert.deepEqual(matched.map((g) => g.slug), ['elevator-untagged']);
});

test('grillMatches includes the project tag', () => {
  assert.ok(grillMatches(grill('call-button', 'x', { project: 'pz-elevators' }), ['pz-elevators', 'call']));
  assert.ok(!grillMatches(grill('call-button', 'x'), ['pz-elevators']));
});

test('digestLines', () => {
  const tasks = [
    task('pz-elevators-1', { status: 'doing' }),
    task('pz-elevators-2', { created: '2026-09-01' }),
    task('pz-elevators-3', { priority: 'high', created: '2026-10-02' }),
    task('pz-elevators-4', { blocked_by: ['pz-elevators-1'] }),
    task('pz-elevators-5', { status: 'idea', grill: 'linked-elevator' }),
    task('other-1'),
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
  const grills = [grill('elevator-call-button'), grill('linked-elevator'), grill('unrelated')];
  const lines = digestLines(project, tasks, sessions, grills);
  assert.equal(lines[0], 'tracker: pz-elevators — Rideable Elevators (focus)');
  assert.equal(lines[1], 'doing: pz-elevators-1 Task pz-elevators-1');
  assert.equal(lines[2], 'ready 2 (1 idea): pz-elevators-3 Task pz-elevators-3; pz-elevators-2 Task pz-elevators-2');
  assert.match(lines[3], /^recent: 09-2[67] Call button light \(1 commit\)$/);
  assert.equal(lines[4], 'grill: 1 old session matches elevator/rideable (tracker search <word>)');
  assert.equal(lines.length, 5);
});

test('digestLines: tagged grill sessions', () => {
  const grills = [
    grill('a', '', { project: 'pz-elevators', status: 'in-progress', updated: '2026-10-01' }),
    grill('b', '', { project: 'pz-elevators', status: 'in-progress', updated: '2026-10-03' }),
    grill('c', '', { project: 'pz-elevators', status: 'in-progress', updated: '2026-09-01' }),
    grill('d', '', { project: 'pz-elevators', status: 'planned' }),
    grill('e', '', { project: 'pz-elevators', status: 'in-progress' }),
    grill('elevator-old'),
  ];
  const tasks = [task('pz-elevators-1', { grill: 'e' })];
  assert.equal(
    digestLines(project, tasks, [], grills).at(-1),
    'grill: 4 sessions tagged (in progress: b, a, …) · 1 old session matches elevator/rideable (tracker search <word>)',
  );
  assert.equal(
    digestLines(project, [], [], [grill('d', '', { project: 'pz-elevators', status: 'planned' })]).at(-1),
    'grill: 1 session tagged (tracker search <word>)',
  );
});

test('digestLines: quiet project', () => {
  assert.deepEqual(digestLines({ ...project, focus: false, status: 'paused' }, [], [], []), [
    'tracker: pz-elevators — Rideable Elevators (paused)',
    'ready: none',
  ]);
});
