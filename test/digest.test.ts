import assert from 'node:assert/strict';
import { test } from 'node:test';
import { digestLines, type DigestGoals } from '../src/digest.ts';
import type { GoalProgress } from '../src/goals.ts';
import { grillForProject, grillMatches, grillMentions, projectTerms, type GrillSession } from '../src/grill.ts';
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

const grill = (slug: string, topic = '', over: Partial<GrillSession> = {}): GrillSession => ({ slug, topic, ...over });

test('projectTerms: 5+ letter words, singularized', () => {
  assert.deepEqual(projectTerms(project), ['rideable', 'elevator']);
  assert.deepEqual(projectTerms({ ...project, key: 'pz-fridges', name: 'Turn off Fridges' }), ['fridge']);
});

test('grillMentions matches word starts only', () => {
  assert.ok(grillMentions(grill('elevator-call-button'), 'elevator'));
  assert.ok(grillMentions(grill('x', 'Nick\'s Rideable Elevators — call'), 'elevator'));
  assert.ok(!grillMentions(grill('bloodhound', 'returns with a pin'), 'turn'));
});

test('grillForProject: tags win over term matching', () => {
  const sessions = [
    grill('tagged', 'anything', { project: 'ELV' }),
    grill('elevator-other-project', '', { project: 'FRI' }),
    grill('elevator-untagged'),
    grill('unrelated'),
  ];
  const { tagged, matched } = grillForProject(sessions, project);
  assert.deepEqual(tagged.map((g) => g.slug), ['tagged']);
  assert.deepEqual(matched.map((g) => g.slug), ['elevator-untagged']);
});

test('grillMatches includes the project tag', () => {
  assert.ok(grillMatches(grill('call-button', 'x', { project: 'ELV' }), ['elv', 'call']));
  assert.ok(!grillMatches(grill('call-button', 'x'), ['pz-elevators']));
});

test('digestLines', () => {
  const issues = [
    issue('ELV-1', { status: 'doing' }),
    issue('ELV-2', { created: '2026-09-01' }),
    issue('ELV-3', { priority: 'high', created: '2026-10-02' }),
    issue('ELV-4', { blocked_by: ['ELV-1'] }),
    issue('ELV-5', { status: 'idea', grill: 'linked-elevator' }),
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
  const grills = [grill('elevator-call-button'), grill('linked-elevator'), grill('unrelated')];
  const lines = digestLines(project, issues, sessions, grills);
  assert.equal(lines[0], 'belay: ELV — Rideable Elevators (focus)');
  assert.equal(lines[1], 'doing: ELV-1 Issue ELV-1');
  assert.equal(lines[2], 'ready 2 (1 idea): ELV-3 Issue ELV-3; ELV-2 Issue ELV-2');
  assert.match(lines[3], /^recent: 09-2[67] Call button light \(1 commit\)$/);
  assert.equal(lines[4], 'grill: 1 old session matches rideable/elevator (belay search <word>)');
  assert.equal(lines.length, 5);
});

test('digestLines: tagged grill sessions', () => {
  const grills = [
    grill('a', '', { project: 'ELV', status: 'in-progress', updated: '2026-10-01' }),
    grill('b', '', { project: 'ELV', status: 'in-progress', updated: '2026-10-03' }),
    grill('c', '', { project: 'ELV', status: 'in-progress', updated: '2026-09-01' }),
    grill('d', '', { project: 'ELV', status: 'planned' }),
    grill('e', '', { project: 'ELV', status: 'in-progress' }),
    grill('elevator-old'),
  ];
  const issues = [issue('ELV-1', { grill: 'e' })];
  assert.equal(
    digestLines(project, issues, [], grills).at(-1),
    'grill: 4 sessions tagged (in progress: b, a, …) · 1 old session matches rideable/elevator (belay search <word>)',
  );
  assert.equal(
    digestLines(project, [], [], [grill('d', '', { project: 'elv', status: 'planned' })]).at(-1),
    'grill: 1 session tagged (belay search <word>)',
  );
});

test('digestLines: quiet project', () => {
  assert.deepEqual(digestLines({ ...project, focus: false, status: 'paused' }, [], [], []), [
    'belay: ELV — Rideable Elevators (paused)',
    'ready: none',
  ]);
});

const THU = '2026-10-08';
const jobGoal: GoalProgress = { project: 'JOB', urgency: 1, form: 'quantity', kind: 'applied', done: 3, of: 10, metToday: false };
const goals = (over: Partial<DigestGoals> = {}): DigestGoals => ({ day: THU, progress: [jobGoal], moved: new Set([THU]), logs: [], ...over });

test('digestLines: other goals not yet met today, with their next ready issue', () => {
  const issues = [issue('JOB-1', { status: 'doing' }), issue('JOB-2', { created: '2026-09-01' }), issue('JOB-3', { priority: 'high' })];
  const met: GoalProgress = { project: 'PORT', urgency: 2, form: 'habit', done: 3, of: 5, metToday: true };
  const behind: GoalProgress = { project: 'PORT', urgency: 0, form: 'target', date: '2026-10-19', state: 'behind', scope: 8, left: 7, daysLeft: 11 };
  const own: GoalProgress = { ...jobGoal, project: 'ELV' };
  assert.equal(digestLines(project, issues, [], [], goals({ progress: [own, jobGoal, met] })).at(-1), 'goals: JOB 3/10 applied — next: JOB-3');
  assert.equal(
    digestLines(project, issues, [], [], goals({ progress: [jobGoal, behind] })).at(-1),
    'goals: JOB 3/10 applied — next: JOB-3; PORT 7 left ▲11d, behind',
  );
  assert.equal(digestLines(project, issues, [], [], goals({ progress: [met] })).length, 2);
});

test('digestLines: a goal project quiet two work days shows its latest note', () => {
  const goalProject: Project = { ...project, goal: { habit: 5 } };
  const issues = [
    issue('ELV-1', { comments: [{ at: '2026-10-05T10:00', by: 'user', text: 'older comment' }] }),
    issue('ELV-2', { comments: [{ at: '2026-10-06T02:30', by: 'claude', text: 'late-night\n  fix' }] }),
  ];
  const other = { project: 'OTH', at: '2026-10-07T09:00', by: 'user' as const, text: 'other project', day: '2026-10-07', n: 1 };
  const quiet = goals({ progress: [], moved: new Set(['2026-10-05']), logs: [other] });
  assert.equal(digestLines(goalProject, issues, [], [], quiet).at(-1), 'last: 2026-10-05 late-night fix');
  assert.equal(digestLines(goalProject, issues, [], [], goals({ progress: [], moved: new Set(['2026-10-07']) })).length, 2);
  assert.equal(digestLines(project, issues, [], [], quiet).length, 2);
  const backdated = { ...other, project: 'ELV', at: '2026-10-06T09:00', text: 'logged', day: '2026-10-05' };
  assert.equal(digestLines(goalProject, issues, [], [], { ...quiet, logs: [other, backdated] }).at(-1), 'last: 2026-10-06 logged');
});
