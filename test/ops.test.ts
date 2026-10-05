import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import {
  CommentConflictError,
  ConflictError,
  Ctx,
  addComment,
  addProject,
  addIssue,
  bodyHash,
  commentAuthor,
  deleteComment,
  deleteIssue,
  editComment,
  editProject,
  editIssue,
  moveProject,
  rekeyProject,
  replaceBody,
  setFocus,
  setPriority,
  setStatus,
} from '../src/ops.ts';
import { next } from '../src/query.ts';
import { createIssue, loadOrder, loadProjects, loadIssues, saveOrder, saveProject, today, type Issue } from '../src/store.ts';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'tracker-'));
  mkdirSync(join(dir, 'projects'));
  mkdirSync(join(dir, 'issues'));
  saveProject(dir, { key: 'PIX', name: 'Pixel Imperium', paths: ['C:/x'], status: 'active', focus: false, body: '' });
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

const USER = { by: 'user' } as const;

const issue = (over: Partial<Issue> = {}): Omit<Issue, 'id'> => ({
  title: 'Do the thing',
  project: 'PIX',
  status: 'todo',
  blocked_by: [],
  source: 'user',
  created: '2026-10-01',
  updated: '2026-10-01',
  comments: [],
  body: '',
  ...over,
});

test('setStatus re-reads: a body line appended after an earlier load survives', () => {
  createIssue(dir, issue());
  const stale = new Ctx(dir);
  const file = join(dir, 'issues', 'pix-1.md');
  writeFileSync(file, `${readFileSync(file, 'utf8')}\nclaude was here\n`);
  assert.equal(stale.issue('PIX-1').body, '');
  const { before, issue: t } = setStatus(new Ctx(dir), 'PIX-1', 'doing');
  assert.equal(before, 'todo');
  assert.equal(t.status, 'doing');
  assert.match(loadIssues(dir)[0].body, /claude was here/);
});

test('setStatus reports open blockers and rejects bad statuses', () => {
  createIssue(dir, issue({ title: 'blocker' }));
  createIssue(dir, issue({ blocked_by: ['PIX-1'] }));
  assert.deepEqual(setStatus(new Ctx(dir), 'PIX-2', 'doing').open.map((t) => t.id), ['PIX-1']);
  assert.throws(() => setStatus(new Ctx(dir), 'PIX-2', 'blocked'), /status must be one of/);
  assert.throws(() => setStatus(new Ctx(dir), 'PIX-9', 'done'), /no issue 'PIX-9'/);
});

test('addIssue validates title, project, status and blockers', () => {
  const ctx = new Ctx(dir);
  assert.throws(() => addIssue(ctx, { title: '  ', project: 'PIX' }), /title is empty/);
  assert.throws(() => addIssue(ctx, { title: 'x', project: 'nope' }), /no project 'nope'/);
  assert.throws(() => addIssue(ctx, { title: 'x', project: 'PIX', status: 'doing' }), /status must be one of idea\|todo/);
  assert.throws(() => addIssue(ctx, { title: 'x', project: 'PIX', blockers: ['PIX-7'] }), /no issue 'PIX-7'/);
  const t = addIssue(ctx, { title: ' x ', project: 'PIX', status: 'idea', source: 'claude' });
  assert.equal(t.id, 'PIX-1');
  assert.equal(t.title, 'x');
  assert.deepEqual(t.comments, []);
});

test('addIssue trims the body', () => {
  assert.equal(addIssue(new Ctx(dir), { title: 'a', project: 'PIX', body: ' hi \n' }).body, 'hi');
  assert.equal(addIssue(new Ctx(dir), { title: 'c', project: 'PIX' }).body, '');
});

test('an issue cannot block itself', () => {
  createIssue(dir, issue());
  assert.throws(() => new Ctx(dir).checkBlockers('PIX-1', ['PIX-1']), /cannot block itself/);
});

test('setPriority and setFocus round-trip', () => {
  createIssue(dir, issue());
  setPriority(new Ctx(dir), 'PIX-1', true);
  assert.equal(loadIssues(dir)[0].priority, 'high');
  setPriority(new Ctx(dir), 'PIX-1', false);
  assert.equal(loadIssues(dir)[0].priority, undefined);
  assert.doesNotMatch(readFileSync(join(dir, 'issues', 'pix-1.md'), 'utf8'), /priority/);

  setFocus(new Ctx(dir), 'PIX', true);
  assert.equal(loadProjects(dir)[0].focus, true);
  setFocus(new Ctx(dir), 'PIX', false);
  assert.equal(loadProjects(dir)[0].focus, false);
});

test('editIssue sets, clears and validates fields like the old cmdEdit', () => {
  createIssue(dir, issue({ title: 'blocker' }));
  createIssue(dir, issue({ grill: 'g', plan: 'p.md' }));
  const t = editIssue(new Ctx(dir), 'PIX-2', { title: ' New ', blockers: ['PIX-1'], priority: 'high', grill: '' });
  assert.deepEqual(loadIssues(dir)[1], t);
  assert.equal(t.title, 'New');
  assert.deepEqual(t.blocked_by, ['PIX-1']);
  assert.equal(t.priority, 'high');
  assert.equal(t.grill, undefined);
  assert.equal(t.plan, 'p.md');
  assert.equal(t.updated, today());

  assert.equal(editIssue(new Ctx(dir), 'PIX-2', { priority: 'none' }).priority, undefined);
  assert.throws(() => editIssue(new Ctx(dir), 'PIX-2', { title: ' ' }), /title is empty/);
  assert.throws(() => editIssue(new Ctx(dir), 'PIX-2', { priority: 'low' }), /priority must be one of high\|none/);
  assert.throws(() => editIssue(new Ctx(dir), 'PIX-2', { blockers: ['PIX-2'] }), /cannot block itself/);
  assert.throws(() => editIssue(new Ctx(dir), 'PIX-2', { blockers: ['PIX-9'] }), /no issue 'PIX-9'/);
});

test('editIssue replaces the body', () => {
  createIssue(dir, issue({ body: 'old' }));
  assert.equal(editIssue(new Ctx(dir), 'PIX-1', { body: '  fresh\n' }).body, 'fresh');
});

test('addComment appends a trimmed, timestamped comment, bumps updated and leaves the body alone', () => {
  createIssue(dir, issue({ body: 'desc' }));
  const { issue: t, n } = addComment(new Ctx(dir), 'pix-1', ' first\r\nline two\n', { by: 'claude', session: 's1' });
  assert.equal(n, 1);
  assert.deepEqual(loadIssues(dir)[0], t);
  assert.equal(t.body, 'desc');
  assert.equal(t.updated, today());
  assert.match(t.comments[0].at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
  assert.deepEqual({ ...t.comments[0], at: '' }, { at: '', by: 'claude', session: 's1', text: 'first\nline two' });
  assert.equal(addComment(new Ctx(dir), 'PIX-1', 'second', { by: 'user' }).n, 2);
  assert.throws(() => addComment(new Ctx(dir), 'PIX-1', '  ', { by: 'user' }), /comment is empty/);
});

test('editComment and deleteComment address #n, bump updated and leave the body alone', () => {
  const comments = ['a', 'b', 'c'].map((text) => ({ at: '2026-10-01T09:00', by: 'user' as const, text }));
  createIssue(dir, issue({ body: 'desc', comments }));
  let t = editComment(new Ctx(dir), 'PIX-1', 2, ' B ');
  assert.deepEqual(t.comments.map((c) => c.text), ['a', 'B', 'c']);
  assert.equal(t.comments[1].at, '2026-10-01T09:00');
  assert.equal(t.updated, today());
  t = deleteComment(new Ctx(dir), 'PIX-1', 1);
  assert.deepEqual(loadIssues(dir)[0].comments.map((c) => c.text), ['B', 'c']);
  assert.equal(t.body, 'desc');

  for (const n of [0, 3, 1.5]) {
    assert.throws(() => editComment(new Ctx(dir), 'PIX-1', n, 'x'), /PIX-1 has no comment #.* \(it has 2\)/);
    assert.throws(() => deleteComment(new Ctx(dir), 'PIX-1', n), /has no comment/);
  }
  assert.throws(() => editComment(new Ctx(dir), 'PIX-1', 1, ''), /comment is empty/);
});

test('editComment and deleteComment refuse when #n no longer has the expected time', () => {
  createIssue(dir, issue({ comments: [{ at: '2026-10-01T09:00', by: 'user', text: 'a' }, { at: '2026-10-02T09:00', by: 'claude', text: 'b' }] }));
  assert.throws(() => editComment(new Ctx(dir), 'PIX-1', 1, 'x', '2026-10-02T09:00'), CommentConflictError);
  assert.throws(() => deleteComment(new Ctx(dir), 'PIX-1', 2, '2026-10-01T09:00'), /PIX-1 #2 changed on disk/);
  assert.deepEqual(loadIssues(dir)[0].comments.map((c) => c.text), ['a', 'b']);
  deleteComment(new Ctx(dir), 'PIX-1', 2, '2026-10-02T09:00');
  editComment(new Ctx(dir), 'PIX-1', 1, 'x', '2026-10-01T09:00');
  assert.deepEqual(loadIssues(dir)[0].comments.map((c) => c.text), ['x']);
});

test('commentAuthor: claude inside Claude Code with its session, user outside, --as overrides', () => {
  assert.deepEqual(commentAuthor({}), { by: 'user' });
  assert.deepEqual(commentAuthor({ CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'abc' }), { by: 'claude', session: 'abc' });
  assert.deepEqual(commentAuthor({ CLAUDECODE: '1' }), { by: 'claude' });
  assert.deepEqual(commentAuthor({ CLAUDECODE: '1', CLAUDE_CODE_SESSION_ID: 'abc' }, 'user'), { by: 'user' });
  assert.deepEqual(commentAuthor({}, 'claude'), { by: 'claude' });
  assert.throws(() => commentAuthor({}, 'system'), /--as must be one of user\|claude/);
});

test('replaceBody saves on a matching hash and conflicts on a stale one', () => {
  createIssue(dir, issue({ body: 'v1' }));
  const loaded = bodyHash(new Ctx(dir).issue('PIX-1').body);
  replaceBody(new Ctx(dir), 'PIX-1', 'v2', loaded);
  assert.equal(loadIssues(dir)[0].body, 'v2');

  assert.throws(
    () => replaceBody(new Ctx(dir), 'PIX-1', 'v3', loaded),
    (e) => e instanceof ConflictError && e.current === 'v2',
  );
  assert.equal(loadIssues(dir)[0].body, 'v2');
  replaceBody(new Ctx(dir), 'PIX-1', 'v4');
  assert.equal(loadIssues(dir)[0].body, 'v4');
});

test('deleteIssue strips the id from dependents, comments on them as the caller, and makes them ready', () => {
  saveProject(dir, { key: 'PIX', name: 'Pixel Imperium', paths: [], status: 'active', focus: true, body: '' });
  createIssue(dir, issue({ title: 'doomed' }));
  createIssue(dir, issue({ title: 'other' }));
  createIssue(dir, issue({ title: 'dependent', blocked_by: ['PIX-1', 'PIX-2'] }));
  createIssue(dir, issue({ title: 'solo', blocked_by: ['PIX-1'] }));

  const dependents = deleteIssue(new Ctx(dir), 'PIX-1', { by: 'claude', session: 's1' });
  assert.deepEqual(dependents.map((t) => t.id), ['PIX-3', 'PIX-4']);
  assert.equal(existsSync(join(dir, 'issues', 'pix-1.md')), false);
  const issues = loadIssues(dir);
  assert.deepEqual(issues.map((t) => [t.id, t.blocked_by]), [['PIX-2', []], ['PIX-3', ['PIX-2']], ['PIX-4', []]]);
  for (const t of issues.slice(1)) {
    assert.deepEqual(
      t.comments.map(({ by, session, text }) => ({ by, session, text })),
      [{ by: 'claude', session: 's1', text: 'blocker PIX-1 deleted' }],
    );
    assert.equal(t.body, '');
  }
  assert.deepEqual(issues[0].comments, []);
  assert.ok(next(loadProjects(dir), issues).focus.some((t) => t.id === 'PIX-4'));
  assert.throws(() => deleteIssue(new Ctx(dir), 'PIX-1', USER), /no issue 'PIX-1'/);
});

test('deleteIssue writes dependents before removing the file', () => {
  createIssue(dir, issue({ title: 'doomed' }));
  createIssue(dir, issue({ blocked_by: ['PIX-1'] }));
  // A directory where the atomic write's temp file goes makes the dependent's save fail.
  mkdirSync(join(dir, 'issues', `pix-2.md.${process.pid}.tmp`));
  assert.throws(() => deleteIssue(new Ctx(dir), 'PIX-1', USER));
  assert.ok(existsSync(join(dir, 'issues', 'pix-1.md')));
});

test('editProject sets, clears and validates fields', () => {
  const p = editProject(new Ctx(dir), 'PIX', { name: ' PI ', group: 'games', status: 'paused', focus: true });
  assert.deepEqual(loadProjects(dir)[0], p);
  assert.deepEqual([p.name, p.group, p.status, p.focus], ['PI', 'games', 'paused', true]);
  assert.equal(editProject(new Ctx(dir), 'PIX', { group: '' }).group, undefined);
  assert.throws(() => editProject(new Ctx(dir), 'PIX', { name: '' }), /name is empty/);
  assert.throws(() => editProject(new Ctx(dir), 'PIX', { status: 'gone' }), /status must be one of active\|paused\|archived/);
  assert.throws(() => editProject(new Ctx(dir), 'nope', {}), /no project 'nope'/);
});

test('keys and IDs are case-insensitive and stored uppercase', () => {
  createIssue(dir, issue());
  const t = addIssue(new Ctx(dir), { title: 'x', project: 'pix', blockers: ['pix-1'] });
  assert.deepEqual([t.id, t.project, t.blocked_by], ['PIX-2', 'PIX', ['PIX-1']]);
  assert.equal(setStatus(new Ctx(dir), 'Pix-2', 'doing').issue.id, 'PIX-2');
  assert.throws(() => editIssue(new Ctx(dir), 'pix-2', { blockers: ['PIX-2'] }), /cannot block itself/);
  assert.deepEqual(deleteIssue(new Ctx(dir), 'pix-1', USER).map((d) => d.blocked_by), [[]]);
});

test('addProject derives a 3-letter key, 4 on a clash, or takes one', () => {
  const add = (name: string, key?: string) => addProject(new Ctx(dir), { name, key, paths: [dir] }).project.key;
  assert.equal(add('Rideable Elevators'), 'REL');
  assert.equal(add('Rideable Elevator Lights'), 'RELR');
  assert.equal(add('Portfolio site', 'port'), 'PORT');
  assert.ok(existsSync(join(dir, 'projects', 'port.md')));
  assert.throws(() => add('Anything', 'rel'), /project 'REL' already exists/);
  assert.throws(() => add('Anything', 'pz-x'), /3–4 letters/);
  assert.throws(() => addProject(new Ctx(dir), { name: 'X', paths: [] }), /at least one path/);
});

test('rekeyProject renames the project, its issues and every blocker reference', () => {
  saveProject(dir, { key: 'PZ-ELEVATORS', name: 'Rideable Elevators', paths: [], status: 'active', focus: true, body: '' });
  createIssue(dir, issue({ project: 'PZ-ELEVATORS' }));
  createIssue(dir, issue({ project: 'PZ-ELEVATORS', blocked_by: ['PZ-ELEVATORS-1'] }));
  createIssue(dir, issue({ blocked_by: ['PZ-ELEVATORS-2'] }));

  const { renamed } = rekeyProject(new Ctx(dir), 'pz-elevators', 'elv');
  assert.deepEqual([...renamed], [['PZ-ELEVATORS-1', 'ELV-1'], ['PZ-ELEVATORS-2', 'ELV-2']]);
  assert.deepEqual(loadProjects(dir).map((p) => [p.key, p.focus]), [['ELV', true], ['PIX', false]]);
  assert.deepEqual(loadIssues(dir).map((t) => [t.id, t.project, t.blocked_by]), [
    ['ELV-1', 'ELV', []],
    ['ELV-2', 'ELV', ['ELV-1']],
    ['PIX-1', 'PIX', ['ELV-2']],
  ]);
  assert.equal(existsSync(join(dir, 'projects', 'pz-elevators.md')), false);
  assert.throws(() => rekeyProject(new Ctx(dir), 'elv', 'pix'), /project 'PIX' already exists/);
  assert.throws(() => rekeyProject(new Ctx(dir), 'elv', 'elevator'), /3–4 letters/);
});

test('moveProject places a project before, after, at the top or bottom, and saves the full order', () => {
  for (const key of ['ELV', 'FRG']) saveProject(dir, { key, name: key, paths: [], status: 'active', focus: false, body: '' });
  const keys = () => new Ctx(dir).projects.map((p) => p.key);
  assert.deepEqual(keys(), ['ELV', 'FRG', 'PIX']);

  assert.deepEqual(moveProject(new Ctx(dir), 'pix', 'top'), ['PIX', 'ELV', 'FRG']);
  assert.deepEqual(loadOrder(dir), ['PIX', 'ELV', 'FRG']);
  moveProject(new Ctx(dir), 'pix', 'bottom');
  assert.deepEqual(keys(), ['ELV', 'FRG', 'PIX']);
  moveProject(new Ctx(dir), 'frg', { before: 'elv' });
  assert.deepEqual(keys(), ['FRG', 'ELV', 'PIX']);
  moveProject(new Ctx(dir), 'frg', { after: 'pix' });
  assert.deepEqual(keys(), ['ELV', 'PIX', 'FRG']);
  moveProject(new Ctx(dir), 'elv', { after: 'pix' });
  assert.deepEqual(keys(), ['PIX', 'ELV', 'FRG']);

  assert.throws(() => moveProject(new Ctx(dir), 'elv', { before: 'nope' }), /no project 'nope'/);
  assert.throws(() => moveProject(new Ctx(dir), 'elv', { after: 'ELV' }), /relative to itself/);
});

test('moveProject materialises unlisted projects where they currently sort', () => {
  for (const key of ['ELV', 'FRG', 'ZED']) saveProject(dir, { key, name: key, paths: [], status: 'active', focus: false, body: '' });
  saveOrder(dir, ['FRG', 'GONE']);
  moveProject(new Ctx(dir), 'zed', { before: 'pix' });
  assert.deepEqual(loadOrder(dir), ['FRG', 'ELV', 'ZED', 'PIX']);
});

test('rekeyProject renames the key in order.yaml', () => {
  saveProject(dir, { key: 'PZ-ELEVATORS', name: 'Elevators', paths: [], status: 'active', focus: false, body: '' });
  saveOrder(dir, ['PZ-ELEVATORS', 'PIX']);
  rekeyProject(new Ctx(dir), 'pz-elevators', 'elv');
  assert.deepEqual(loadOrder(dir), ['ELV', 'PIX']);
  assert.deepEqual(new Ctx(dir).projects.map((p) => p.key), ['ELV', 'PIX']);
});

test('rekeyProject leaves order.yaml alone when the project is unlisted', () => {
  rekeyProject(new Ctx(dir), 'pix', 'pxl');
  assert.equal(existsSync(join(dir, 'order.yaml')), false);
});
