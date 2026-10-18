import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { hasHistory, initHistory } from '../src/gitlog.ts';
import { Ctx, addComment, addIssue, addProject, rekeyProject, replaceBody, setSettings, setStatus } from '../src/ops.ts';

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

test('initHistory refuses an existing repo; the baseline commit ignores cache/', () => {
  git('init', '-q');
  assert.throws(() => initHistory(dir), /already has git history/);
  rmSync(join(dir, '.git'), { recursive: true, force: true });
  mkdirSync(join(dir, 'cache'));
  writeFileSync(join(dir, 'cache', 'x.json'), '{}');
  initHistory(dir);
  assert.equal(readFileSync(join(dir, '.gitignore'), 'utf8'), 'cache/\n');
  assert.deepEqual(subjects(), ['init - user']);
  assert.equal(git('ls-files').includes('cache/'), false);
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
  setSettings(new Ctx(dir), { theme: 'dark' });
  assert.deepEqual(subjects().reverse(), [
    'init - user',
    'project add ELV "Elven" - user',
    'add ELV-1 "First" - user',
    'add ELV-2 "Second" - user',
    'set ELV-1 todo->doing - user',
    'comment ELV-1 #1 - user',
    'body ELV-1 - user',
    'project rekey ELV->ELF - user',
    'settings theme=dark - user',
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
