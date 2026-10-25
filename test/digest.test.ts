import assert from 'node:assert/strict';
import { test } from 'node:test';
import { digestLines } from '../src/digest.ts';
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

test('digestLines: bad files after ready, at most two', () => {
  const bad = [
    { file: 'issues/elv-7.md', error: 'line 4: Nested mappings are not allowed in compact mappings, really' },
    { file: 'issues/elv-8.md', error: 'missing frontmatter' },
    { file: 'projects/oth.md', error: "'name' must be a non-empty string" },
  ];
  const lines = digestLines(project, [issue('ELV-1')], [], [], { bad });
  assert.equal(lines[2], 'bad files: issues/elv-7.md (line 4: Nested mappings are not allowed in compact mappings…); issues/elv-8.md (missing frontmatter); …');
  assert.equal(digestLines(project, [issue('ELV-1')], [], [], { bad: bad.slice(1, 2) })[2], 'bad files: issues/elv-8.md (missing frontmatter)');
  assert.equal(digestLines(project, [issue('ELV-1')], [], []).length, 2);
});

test('digestLines: doing shows the 3 oldest, counted only past 3', () => {
  const doing = (n: number) => Array.from({ length: n }, (_, i) => issue(`ELV-${i + 1}`, { status: 'doing', created: `2026-09-0${9 - i}` }));
  assert.equal(digestLines(project, doing(3), [], [])[1], 'doing: ELV-3 Issue ELV-3; ELV-2 Issue ELV-2; ELV-1 Issue ELV-1');
  assert.equal(digestLines(project, doing(4), [], [])[1], 'doing 4: ELV-4 Issue ELV-4; ELV-3 Issue ELV-3; ELV-2 Issue ELV-2; …');
});

test('digestLines: compact keeps header, doing, ready and bad files', () => {
  const issues = [issue('ELV-1', { status: 'doing' }), issue('ELV-2')];
  const sessions: Session[] = [{ id: 's', cwd: '', title: 'Call button', start: '2026-09-26T19:00:00Z', end: '2026-09-26T19:30:00Z' }];
  const grills = [grill('elevator-call-button')];
  const bad = [{ file: 'issues/elv-8.md', error: 'missing frontmatter' }];
  assert.equal(digestLines(project, issues, sessions, grills).length, 5);
  assert.deepEqual(digestLines(project, issues, sessions, grills, { bad, compact: true }), [
    'belay: ELV — Rideable Elevators (focus)',
    'doing: ELV-1 Issue ELV-1',
    'ready 1: ELV-2 Issue ELV-2',
    'bad files: issues/elv-8.md (missing frontmatter)',
  ]);
});
