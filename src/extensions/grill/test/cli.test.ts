import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { initHistory } from '../../../gitlog.ts';
import { grillForProject, grillMatches, grillMentions, projectTerms, type GrillSession } from '../sessions.ts';
import type { Issue, Project } from '../../../store.ts';
import { commitGrill, digestLines, searchLines } from '../cli.ts';
import { manifest } from '../manifest.ts';

let dir: string;

const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
const subjects = () => git('log', '--format=%s').trim().split('\n');
const changed = (rev = 'HEAD') => git('show', '--name-status', '--no-renames', '--format=', rev).trim().split('\n');

const GIT_ENV = ['GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL'];
const savedEnv = Object.fromEntries(GIT_ENV.map((k) => [k, process.env[k]]));

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'belay-'));
  mkdirSync(join(dir, 'projects'));
  mkdirSync(join(dir, 'issues'));
  process.env.GIT_AUTHOR_NAME = process.env.GIT_COMMITTER_NAME = 'Test';
  process.env.GIT_AUTHOR_EMAIL = process.env.GIT_COMMITTER_EMAIL = 'test@example.com';
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

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

const session = (slug: string, topic = '', over: Partial<GrillSession> = {}): GrillSession => ({ slug, topic, ...over });

/** An issue's `extra` holding grill's owned fields. */
const linked = (fields: { grill?: string; plan?: string }): Pick<Issue, 'extra'> => ({
  extra: Object.entries(fields).map(([key, value]) => ({ key, value, after: key === 'grill' ? 'source' : 'grill' })),
});

test('projectTerms: 5+ letter words, singularized', () => {
  assert.deepEqual(projectTerms(project), ['rideable', 'elevator']);
  assert.deepEqual(projectTerms({ ...project, key: 'pz-fridges', name: 'Turn off Fridges' }), ['fridge']);
});

test('grillMentions matches word starts only', () => {
  assert.ok(grillMentions(session('elevator-call-button'), 'elevator'));
  assert.ok(grillMentions(session('x', "Nick's Rideable Elevators — call"), 'elevator'));
  assert.ok(!grillMentions(session('bloodhound', 'returns with a pin'), 'turn'));
});

test('grillForProject: tags win over term matching', () => {
  const sessions = [
    session('tagged', 'anything', { project: 'ELV' }),
    session('elevator-other-project', '', { project: 'FRI' }),
    session('elevator-untagged'),
    session('unrelated'),
  ];
  const { tagged, matched } = grillForProject(sessions, project);
  assert.deepEqual(tagged.map((g) => g.slug), ['tagged']);
  assert.deepEqual(matched.map((g) => g.slug), ['elevator-untagged']);
});

test('grillMatches includes the project tag', () => {
  assert.ok(grillMatches(session('call-button', 'x', { project: 'ELV' }), ['elv', 'call']));
  assert.ok(!grillMatches(session('call-button', 'x'), ['pz-elevators']));
});

test('the digest line counts unlinked sessions matched by terms', () => {
  const issues = [issue('ELV-5', { status: 'idea', ...linked({ grill: 'linked-elevator' }) })];
  const grills = [session('elevator-call-button'), session('linked-elevator'), session('unrelated')];
  assert.deepEqual(digestLines(project, issues, grills), ['grill: 1 old session matches rideable/elevator (belay search <word>)']);
  assert.deepEqual(digestLines(project, issues, [session('unrelated')]), []);
});

test('the digest line counts tagged sessions, naming the newest in progress', () => {
  const grills = [
    session('a', '', { project: 'ELV', status: 'in-progress', updated: '2026-10-01' }),
    session('b', '', { project: 'ELV', status: 'in-progress', updated: '2026-10-03' }),
    session('c', '', { project: 'ELV', status: 'in-progress', updated: '2026-09-01' }),
    session('d', '', { project: 'ELV', status: 'planned' }),
    session('e', '', { project: 'ELV', status: 'in-progress' }),
    session('elevator-old'),
  ];
  const issues = [issue('ELV-1', linked({ grill: 'e' }))];
  assert.deepEqual(digestLines(project, issues, grills), [
    'grill: 4 sessions tagged (in progress: b, a, …) · 1 old session matches rideable/elevator (belay search <word>)',
  ]);
  assert.deepEqual(digestLines(project, [], [session('d', '', { project: 'elv', status: 'planned' })]), ['grill: 1 session tagged (belay search <word>)']);
});

test('search lists matching sessions newest first, under a header naming the folder', () => {
  grill('old-elevator', { 'old-elevator.md': '---\ntopic: Lifts\nstatus: planned\nupdated: 2026-09-01\n---\n' });
  grill('new-elevator', { 'new-elevator.md': '---\ntopic: Call button\nstatus: in-progress\nupdated: 2026-10-01\nproject: ELV\n---\n' });
  grill('other', { 'other.md': '---\ntopic: Fridges\n---\n' });
  const lines = searchLines(['elevator'], dir);
  assert.match(lines[0], /^grill sessions \(<slug>\/<slug>\.md in .+grills\)$/);
  assert.deepEqual(lines.slice(1), [
    '  new-elevator  in-progress  2026-10-01  ELV  Call button',
    '  old-elevator  planned      2026-09-01  -    Lifts',
  ]);
  assert.deepEqual(searchLines(['nothing'], dir), []);
});

test("linked kinds: grill opens the session file, plan the plan's absolute path", async () => {
  const { grill: grillPath, plan } = manifest.cli!.linked!;
  assert.equal(await grillPath(issue('BEL-7', linked({ grill: 'some-topic' })), dir), join(dir, 'grills', 'some-topic', 'some-topic.md'));
  assert.equal(await plan(issue('TRK-1', linked({ plan: 'C:/plans/p.md' })), dir), resolve('C:/plans/p.md'));
  assert.equal(await grillPath(issue('TRK-1'), dir), undefined);
  assert.equal(await plan(issue('TRK-1', linked({ grill: 'x' })), dir), undefined);
});

function grill(slug: string, files: Record<string, string>) {
  mkdirSync(join(dir, 'grills', slug), { recursive: true });
  for (const [name, text] of Object.entries(files)) writeFileSync(join(dir, 'grills', slug, name), text);
}

const json = (status: string) => JSON.stringify({ status });

test('commitGrill commits a planned grill folder alone, without its bridge.json', () => {
  initHistory(dir);
  grill('done-one', { 'session.json': json('planned'), 'done-one.md': '# x\n', 'bridge.json': '{}' });
  grill('other', { 'session.json': json('planned') });
  writeFileSync(join(dir, 'stray.txt'), '');
  assert.equal(commitGrill(dir, 'done-one', { by: 'claude', session: 's-1' }), 'committed');
  assert.equal(git('log', '-1', '--format=%s%n%n%b').trim(), 'grill done-one - claude\n\nSession: s-1');
  assert.deepEqual(changed().sort(), ['A\tgrills/done-one/done-one.md', 'A\tgrills/done-one/session.json']);
  assert.equal(commitGrill(dir, 'done-one', { by: 'claude' }), 'unchanged');
});

test("commitGrill leaves bridge.json out even when .gitignore doesn't", () => {
  initHistory(dir);
  writeFileSync(join(dir, '.gitignore'), 'cache/\n');
  git('commit', '-qam', 'old ignore');
  grill('g', { 'session.json': json('planned'), 'bridge.json': '{"token":"t"}' });
  assert.equal(commitGrill(dir, 'g', { by: 'user' }), 'committed');
  assert.deepEqual(changed(), ['A\tgrills/g/session.json']);
  assert.equal(commitGrill(dir, 'g', { by: 'user' }), 'unchanged');
});

test('commitGrill refuses a grill that is not planned, a missing one and a bad slug', () => {
  initHistory(dir);
  grill('live', { 'session.json': json('in-progress'), 'live.md': '---\nstatus: planned\n---\n' });
  assert.throws(() => commitGrill(dir, 'live', { by: 'user' }), /grill 'live' is in-progress; only a planned grill is committed/);
  assert.throws(() => commitGrill(dir, 'nope', { by: 'user' }), /no grill 'nope'/);
  assert.throws(() => commitGrill(dir, '../x', { by: 'user' }), /not a grill slug/);
  assert.deepEqual(subjects(), ['init - user']);
});

test('commitGrill reads a legacy grill status from its session file', () => {
  initHistory(dir);
  grill('old', { 'old.md': '---\ntopic: Old\nstatus: planned\n---\n', 'preview.html': '' });
  grill('dropped', { 'dropped.md': '---\ntopic: Gone\nstatus: abandoned\n---\n' });
  assert.equal(commitGrill(dir, 'old', { by: 'user' }), 'committed');
  assert.throws(() => commitGrill(dir, 'dropped', { by: 'user' }), /is abandoned/);
});

test('commitGrill checks the grill but commits nothing without history', () => {
  grill('g', { 'session.json': json('planned') });
  assert.equal(commitGrill(dir, 'g', { by: 'user' }), 'no history');
  assert.throws(() => commitGrill(dir, 'nope', { by: 'user' }), /no grill/);
});
