import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { commitGrill, GITIGNORE, hasHistory, initHistory } from '../src/gitlog.ts';
import { Ctx, addComment, addIssue, addLog, addProject, deleteLog, rekeyProject, replaceBody, setStatus } from '../src/ops.ts';

let dir: string;
const ENV_KEYS = ['CLAUDECODE', 'CLAUDE_CODE_SESSION_ID', 'GIT_AUTHOR_NAME', 'GIT_AUTHOR_EMAIL', 'GIT_COMMITTER_NAME', 'GIT_COMMITTER_EMAIL'];
const savedEnv = Object.fromEntries(ENV_KEYS.map((k) => [k, process.env[k]]));

const git = (...args: string[]) => execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8' });
const subjects = () => git('log', '--format=%s').trim().split('\n');

function asUser() {
  delete process.env.CLAUDECODE;
  delete process.env.CLAUDE_CODE_SESSION_ID;
}


beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'belay-'));
  mkdirSync(join(dir, 'projects'));
  mkdirSync(join(dir, 'issues'));
  asUser();
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

test('no .git means no history and no commit', () => {
  addProject(new Ctx(dir), { key: 'PIX', name: 'Pixel', paths: ['C:/x'] });
  assert.equal(hasHistory(dir), false);
});

test('initHistory refuses an existing repo; the baseline commit ignores cache/ and runtime files', () => {
  git('init', '-q');
  assert.throws(() => initHistory(dir), /already has git history/);
  rmSync(join(dir, '.git'), { recursive: true, force: true });
  mkdirSync(join(dir, 'cache'));
  writeFileSync(join(dir, 'cache', 'x.json'), '{}');
  mkdirSync(join(dir, 'grills', 'g'), { recursive: true });
  writeFileSync(join(dir, 'grills', 'g', 'bridge.json'), '{}');
  writeFileSync(join(dir, 'grills', 'g', 'g.md'), '');
  mkdirSync(join(dir, 'lessons', 'lesson-x'), { recursive: true });
  writeFileSync(join(dir, 'lessons', 'lesson-x', 'chat.jsonl'), '');
  mkdirSync(join(dir, '.run'));
  writeFileSync(join(dir, '.run', 'restart'), '');
  initHistory(dir);
  assert.equal(readFileSync(join(dir, '.gitignore'), 'utf8'), GITIGNORE);
  assert.deepEqual(subjects(), ['init - user']);
  assert.deepEqual(git('ls-files').trim().split('\n'), ['.gitignore', 'grills/g/g.md']);
});

test('one commit per op, with the subject format', () => {
  initHistory(dir);
  addProject(new Ctx(dir), { key: 'ELV', name: 'Elven', paths: ['C:/x'] });
  const a = addIssue(new Ctx(dir), { project: 'ELV', title: 'First' });
  addIssue(new Ctx(dir), { project: 'ELV', title: 'Second', blockers: [a.id] });
  setStatus(new Ctx(dir), a.id, 'doing');
  addComment(new Ctx(dir), a.id, 'note', { by: 'user' });
  replaceBody(new Ctx(dir), a.id, 'new body');
  rekeyProject(new Ctx(dir), 'ELV', 'ELF');
  assert.deepEqual(subjects().reverse(), [
    'init - user',
    'project add ELV "Elven" - user',
    'add ELV-1 "First" - user',
    'add ELV-2 "Second" - user',
    'set ELV-1 todo->doing - user',
    'comment ELV-1 #1 - user',
    'body ELV-1 - user',
    'project rekey ELV->ELF - user',
  ]);
  assert.equal(git('status', '--porcelain'), '');
});

test('a Claude commit carries its session in the body', () => {
  initHistory(dir);
  addProject(new Ctx(dir), { key: 'PIX', name: 'Pixel', paths: ['C:/x'] });
  process.env.CLAUDECODE = '1';
  process.env.CLAUDE_CODE_SESSION_ID = 'abc-123';
  addIssue(new Ctx(dir), { project: 'PIX', title: 'From Claude' });
  assert.equal(git('log', '-1', '--format=%s%n%n%b').trim(), 'add PIX-1 "From Claude" - claude\n\nSession: abc-123');
});

test('a failing git does not fail the op', (t) => {
  initHistory(dir);
  const errors: string[] = [];
  t.mock.method(console, 'error', (m: string) => errors.push(m));
  writeFileSync(join(dir, '.git', 'index.lock'), '');
  const { project } = addProject(new Ctx(dir), { key: 'PIX', name: 'Pixel', paths: ['C:/x'] });
  assert.equal(project.key, 'PIX');
  assert.equal(existsSync(join(dir, 'projects', 'pix.md')), true);
  assert.equal(errors.length, 1);
  assert.match(errors[0], /^belay: history not committed: git add: /);
  assert.deepEqual(subjects(), ['init - user']);
});

const changed = (rev = 'HEAD') => git('show', '--name-status', '--no-renames', '--format=', rev).trim().split('\n');

test('an op commits only the files it wrote, leaving unrelated untracked and staged files alone', () => {
  initHistory(dir);
  addProject(new Ctx(dir), { key: 'PIX', name: 'Pixel', paths: ['C:/x'] });
  writeFileSync(join(dir, 'stray.txt'), 'untracked');
  writeFileSync(join(dir, 'staged.txt'), 'staged');
  git('add', 'staged.txt');
  const issue = addIssue(new Ctx(dir), { project: 'PIX', title: 'One' });
  assert.deepEqual(changed(), ['A\tissues/pix-1.md']);
  setStatus(new Ctx(dir), issue.id, 'doing');
  assert.deepEqual(changed(), ['M\tissues/pix-1.md']);
  assert.deepEqual(git('status', '--porcelain').trim().split('\n'), ['A  staged.txt', '?? stray.txt']);
});

test('rekey commits the new files and the removal of the old ones', () => {
  initHistory(dir);
  addProject(new Ctx(dir), { key: 'ELV', name: 'Elven', paths: ['C:/x'] });
  addIssue(new Ctx(dir), { project: 'ELV', title: 'First' });
  rekeyProject(new Ctx(dir), 'ELV', 'ELF');
  assert.deepEqual(changed().sort(), ['A\tissues/elf-1.md', 'A\tprojects/elf.md', 'D\tissues/elv-1.md', 'D\tprojects/elv.md']);
  assert.equal(git('status', '--porcelain'), '');
});

test("a log op commits the day's file, including its removal", () => {
  initHistory(dir);
  addProject(new Ctx(dir), { key: 'PIX', name: 'Pixel', paths: ['C:/x'] });
  const { day } = addLog(new Ctx(dir), { project: 'PIX', text: 'did it' }, { by: 'user' });
  assert.deepEqual(changed(), [`A\tlog/${day}.yaml`]);
  deleteLog(new Ctx(dir), `${day}/1`);
  assert.deepEqual(changed(), [`D\tlog/${day}.yaml`]);
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
