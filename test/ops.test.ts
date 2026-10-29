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
  addLog,
  addProject,
  addIssue,
  bodyHash,
  commentAuthor,
  deleteComment,
  deleteIssue,
  deleteLog,
  editLog,
  logDays,
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
import { loadLog, saveLog } from '../src/logs.ts';
import { next } from '../src/query.ts';
import { AT_RE, createIssue, DAY_RE, loadOrder, loadProjects, loadIssues, saveOrder, saveProject, type Issue } from '../src/store.ts';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'belay-'));
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
  assert.match(t.created, DAY_RE);
  assert.equal(t.updated.slice(0, 10), t.created);
  assert.equal(t.updated, t.transitions?.[0].at);
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
  createIssue(dir, issue());
  const t = editIssue(new Ctx(dir), 'PIX-2', { title: ' New ', blockers: ['PIX-1'], priority: 'high' });
  assert.deepEqual(loadIssues(dir)[1], t);
  assert.equal(t.title, 'New');
  assert.deepEqual(t.blocked_by, ['PIX-1']);
  assert.equal(t.priority, 'high');
  assert.match(t.updated, AT_RE);

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
  assert.match(t.updated, AT_RE);
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
  assert.match(t.updated, AT_RE);
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

test('editProject replaces paths, normalized, and refuses an empty list', () => {
  const p = editProject(new Ctx(dir), 'PIX', { paths: ['C:\\Code\\pix\\','C:/Code/pix-old'] });
  assert.deepEqual(loadProjects(dir)[0].paths, p.paths);
  assert.deepEqual(p.paths, ['C:/Code/pix', 'C:/Code/pix-old']);
  assert.throws(() => editProject(new Ctx(dir), 'PIX', { paths: [] }), /at least one path/);
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

test('rekeyProject renames the project, its issues, every blocker reference and its log entries', () => {
  saveProject(dir, { key: 'PZ-ELEVATORS', name: 'Rideable Elevators', paths: [], status: 'active', focus: true, body: '' });
  createIssue(dir, issue({ project: 'PZ-ELEVATORS' }));
  createIssue(dir, issue({ project: 'PZ-ELEVATORS', blocked_by: ['PZ-ELEVATORS-1'] }));
  createIssue(dir, issue({ blocked_by: ['PZ-ELEVATORS-2'] }));
  const entry = { at: '2026-01-02T10:00', by: 'user', text: 'x' } as const;
  saveLog(dir, '2026-01-02', [{ ...entry, project: 'PZ-ELEVATORS' }, { ...entry, project: 'PZ-ELEVATORS', issue: 'PZ-ELEVATORS-2' }, { ...entry, project: 'PIX' }]);

  const { renamed } = rekeyProject(new Ctx(dir), 'pz-elevators', 'elv');
  assert.deepEqual([...renamed], [['PZ-ELEVATORS-1', 'ELV-1'], ['PZ-ELEVATORS-2', 'ELV-2']]);
  assert.deepEqual(loadProjects(dir).map((p) => [p.key, p.focus]), [['ELV', true], ['PIX', false]]);
  assert.deepEqual(loadIssues(dir).map((t) => [t.id, t.project, t.blocked_by]), [
    ['ELV-1', 'ELV', []],
    ['ELV-2', 'ELV', ['ELV-1']],
    ['PIX-1', 'PIX', ['ELV-2']],
  ]);
  assert.equal(existsSync(join(dir, 'projects', 'pz-elevators.md')), false);
  assert.deepEqual(loadLog(dir, '2026-01-02').map((e) => [e.project, e.issue]), [['ELV', undefined], ['ELV', 'ELV-2'], ['PIX', undefined]]);
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

test('addIssue and setStatus record transitions with their author; a no-op set adds none', () => {
  const claude = { by: 'claude', session: 's1' } as const;
  const t = addIssue(new Ctx(dir), { title: 'x', project: 'PIX', status: 'idea' }, claude);
  assert.deepEqual(t.transitions?.map(({ at, ...rest }) => rest), [{ to: 'idea', by: 'claude', session: 's1' }]);
  setStatus(new Ctx(dir), t.id, 'todo', USER);
  setStatus(new Ctx(dir), t.id, 'todo', USER);
  setStatus(new Ctx(dir), t.id, 'done');
  const saved = loadIssues(dir)[0].transitions!;
  assert.deepEqual(saved.map(({ at, ...rest }) => rest), [
    { to: 'idea', by: 'claude', session: 's1' },
    { from: 'idea', to: 'todo', by: 'user' },
    { from: 'todo', to: 'done', by: 'user' },
  ]);
  assert.match(saved[2].at, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
});

test('setStatus starts a transitions list on an issue from before they were recorded', () => {
  createIssue(dir, issue());
  setStatus(new Ctx(dir), 'PIX-1', 'todo');
  assert.equal(loadIssues(dir)[0].transitions, undefined);
  setStatus(new Ctx(dir), 'PIX-1', 'doing');
  assert.deepEqual(loadIssues(dir)[0].transitions?.map((x) => [x.from, x.to]), [['todo', 'doing']]);
});

test('editProject sets kinds', () => {
  const ctx = () => new Ctx(dir);
  assert.deepEqual(editProject(ctx(), 'PIX', { kinds: [' Applied', 'outreach', 'applied', ''] }).kinds, ['applied', 'outreach']);
  assert.equal(editProject(ctx(), 'PIX', { kinds: [] }).kinds, undefined);
  assert.deepEqual(loadProjects(dir)[0], { key: 'PIX', name: 'Pixel Imperium', paths: ['C:/x'], status: 'active', focus: false, group: undefined, body: '' });
});

test('editProject rejects bad kinds', () => {
  assert.throws(() => editProject(new Ctx(dir), 'PIX', { kinds: ['two words'] }), /kind 'two words' must be/);
});

test('addLog validates and appends to the work day file; deleteLog removes by address', () => {
  editProject(new Ctx(dir), 'PIX', { kinds: ['applied'] });
  saveProject(dir, { key: 'JOB', name: 'Job', paths: [], status: 'active', focus: true, body: '' });
  createIssue(dir, issue());
  createIssue(dir, issue({ project: 'JOB' }));
  const clock = new Date(2026, 9, 6, 1, 30);
  const add = (n: Partial<Parameters<typeof addLog>[1]>) => addLog(new Ctx(dir), { project: 'PIX', text: 'x', ...n }, USER, clock);

  const a = add({ text: ' sent CV\r\n', kind: 'Applied', count: 2, minutes: 30, issue: 'pix-1' });
  assert.deepEqual([a.day, a.n], ['2026-10-05', 1]);
  assert.deepEqual(a.entry, { project: 'PIX', at: '2026-10-06T01:30', by: 'user', text: 'sent CV', kind: 'applied', count: 2, minutes: 30, issue: 'PIX-1' });
  assert.equal(add({ text: 'note' }).n, 2);
  assert.equal(add({ day: 'yesterday' }).day, '2026-10-04');
  assert.equal(add({ day: '2026-09-28' }).day, '2026-09-28');
  assert.deepEqual(loadLog(dir, '2026-10-05').map((e) => e.text), ['sent CV', 'note']);

  assert.throws(() => add({ text: ' ' }), /text is empty/);
  assert.throws(() => add({ kind: 'aplied' }), /did you mean 'applied'/);
  assert.throws(() => add({ count: 2 }), /a count needs a kind/);
  assert.throws(() => add({ kind: 'applied', count: 0 }), /count must be a whole number/);
  assert.throws(() => add({ issue: 'JOB-1' }), /JOB-1 is not in PIX/);
  assert.throws(() => add({ issue: 'PIX-9' }), /no issue 'PIX-9'/);
  assert.throws(() => add({ day: '2026-10-06' }), /2026-10-06 is in the future/);
  assert.throws(() => add({ day: '2026-09-27' }), /more than 7 days back/);
  assert.throws(() => add({ project: 'JOB', kind: 'applied' }), /JOB declares no kinds/);

  assert.equal(deleteLog(new Ctx(dir), '2026-10-05/1').text, 'sent CV');
  assert.deepEqual(loadLog(dir, '2026-10-05').map((e) => e.text), ['note']);
  assert.throws(() => deleteLog(new Ctx(dir), '2026-10-05/2'), /2026-10-05 has no log entry #2 \(it has 1\)/);
  assert.throws(() => deleteLog(new Ctx(dir), '2026-10-05/1', '2026-10-05T09:00'), /changed on disk/);
  deleteLog(new Ctx(dir), '2026-10-05/1', '2026-10-06T01:30');
  assert.equal(existsSync(join(dir, 'log', '2026-10-05.yaml')), false);
});

test('editLog patches fields in place and validates like addLog', () => {
  editProject(new Ctx(dir), 'PIX', { kinds: ['applied'] });
  saveProject(dir, { key: 'JOB', name: 'Job', paths: [], status: 'active', focus: true, body: '' });
  createIssue(dir, issue());
  createIssue(dir, issue({ project: 'JOB' }));
  const clock = new Date(2026, 9, 6, 1, 30);
  addLog(new Ctx(dir), { project: 'PIX', text: 'first' }, USER, clock);
  addLog(new Ctx(dir), { project: 'PIX', text: 'sent CV', kind: 'applied', count: 2, minutes: 30 }, { by: 'claude', session: 's1' }, clock);
  const edit = (patch: Parameters<typeof editLog>[2], expectAt?: string) => () => editLog(new Ctx(dir), '2026-10-05/2', patch, expectAt, clock);

  const r = edit({ text: ' fixed\r\nsecond line ', minutes: 45, issue: 'pix-1' }, '2026-10-06T01:30')();
  assert.deepEqual([r.day, r.n], ['2026-10-05', 2]);
  assert.deepEqual(loadLog(dir, '2026-10-05')[1], {
    project: 'PIX',
    at: '2026-10-06T01:30',
    by: 'claude',
    session: 's1',
    text: 'fixed\nsecond line',
    kind: 'applied',
    count: 2,
    minutes: 45,
    issue: 'PIX-1',
  });
  assert.equal(loadLog(dir, '2026-10-05')[0].text, 'first');

  assert.equal(edit({ count: null })().entry.count, undefined);
  assert.equal(edit({ count: 3 })().entry.count, 3);
  const cleared = edit({ kind: '', minutes: null, issue: '' })().entry;
  assert.deepEqual([cleared.kind, cleared.count, cleared.minutes, cleared.issue], [undefined, undefined, undefined, undefined]);
  assert.throws(edit({ count: 2 }), /a count needs a kind/);
  assert.equal(edit({ kind: 'Applied', count: 4 })().entry.count, 4);

  assert.throws(edit({ text: ' ' }), /text is empty/);
  assert.throws(edit({ kind: 'aplied' }), /did you mean 'applied'/);
  assert.throws(edit({ issue: 'JOB-1' }), /JOB-1 is not in PIX/);
  assert.throws(edit({ minutes: 0 }), /minutes must be a whole number/);
  assert.throws(edit({ text: 'x' }, '2026-10-05T09:00'), /changed on disk/);
  assert.throws(() => editLog(new Ctx(dir), '2026-10-05/3', { text: 'x' }), /has no log entry #3/);
});

test('editLog moves an entry to the end of another day within the backdate window', () => {
  const clock = new Date(2026, 9, 6, 1, 30);
  const add = (text: string, day: string) => addLog(new Ctx(dir), { project: 'PIX', text }, USER, clock).day && day;
  add('a', '2026-10-05');
  addLog(new Ctx(dir), { project: 'PIX', text: 'y', day: 'yesterday' }, USER, clock);
  const move = (addr: string, day: string) => editLog(new Ctx(dir), addr, { day }, undefined, clock);

  const r = move('2026-10-05/1', 'yesterday');
  assert.deepEqual([r.day, r.n], ['2026-10-04', 2]);
  assert.equal(r.entry.at, '2026-10-06T01:30');
  assert.deepEqual(loadLog(dir, '2026-10-04').map((e) => e.text), ['y', 'a']);
  assert.equal(existsSync(join(dir, 'log', '2026-10-05.yaml')), false);

  assert.equal(move('2026-10-04/2', '2026-10-04').n, 2);
  assert.throws(() => move('2026-10-04/2', '2026-10-06'), /2026-10-06 is in the future/);
  assert.throws(() => move('2026-10-04/2', '2026-09-27'), /more than 7 days back/);
  assert.deepEqual(loadLog(dir, '2026-10-04').map((e) => e.text), ['y', 'a']);

  writeFileSync(join(dir, 'log', '2026-09-01.yaml'), 'entries:\n  - { project: PIX, at: "2026-09-01T10:00", by: user, text: old }\n');
  assert.equal(move('2026-09-01/1', 'today').day, '2026-10-05');
  assert.equal(existsSync(join(dir, 'log', '2026-09-01.yaml')), false);
});

test('Ctx.logs reads the range once and only on demand', () => {
  const ctx = new Ctx(dir);
  addLog(ctx, { project: 'PIX', text: 'a' }, USER, new Date(2026, 9, 5, 12));
  assert.deepEqual(ctx.logs('2026-10-01', '2026-10-07').map((e) => e.text), ['a']);
  addLog(ctx, { project: 'PIX', text: 'b' }, USER, new Date(2026, 9, 5, 12));
  assert.equal(ctx.logs('2026-10-01', '2026-10-07').length, 1);
  assert.equal(new Ctx(dir).logs('2026-10-01', '2026-10-07').length, 2);
});

test('logDays lists today back to the backdate limit', () => {
  const days = logDays('2026-10-05');
  assert.equal(days.length, 8);
  assert.equal(days[0], '2026-10-05');
  assert.equal(days.at(-1), '2026-09-28');
});

test('a lenient Ctx with bad files refuses writes, naming them', () => {
  createIssue(dir, issue());
  writeFileSync(join(dir, 'issues', 'pix-2.md'), 'no frontmatter');
  assert.throws(() => new Ctx(dir), /issues\/pix-2\.md: missing frontmatter/);
  const ctx = new Ctx(dir, { lenient: true });
  assert.deepEqual(ctx.issues.map((t) => t.id), ['PIX-1']);
  assert.throws(() => setStatus(ctx, 'PIX-1', 'doing'), /^Error: not writing while files are bad: issues\/pix-2\.md \(missing frontmatter\)$/);
  assert.equal(loadIssues(dir, { bad: [] })[0].status, 'todo');
});

/** PIX-1 with plain unknown keys before `id`, after `blocked_by` and at the end. */
const withExtras = () =>
  '---\nfirst: true\nid: PIX-1\ntitle: Do the thing\nproject: PIX\nstatus: todo\nblocked_by: []\nestimate: 3\nsource: user\ncreated: 2026-10-01\nupdated: 2026-10-01\nmeta:\n  a: [x, y]\n---\n';

test('ops keep an issue\'s plain unknown keys in place', () => {
  const file = join(dir, 'issues', 'pix-1.md');
  writeFileSync(file, withExtras());
  createIssue(dir, issue({ title: 'other' }));
  setStatus(new Ctx(dir), 'PIX-1', 'doing');
  addComment(new Ctx(dir), 'PIX-1', 'hi', USER);
  editIssue(new Ctx(dir), 'PIX-1', { title: 'New', priority: 'high' });
  replaceBody(new Ctx(dir), 'PIX-1', 'body');
  editIssue(new Ctx(dir), 'PIX-2', { blockers: ['PIX-1'] });
  rekeyProject(new Ctx(dir), 'PIX', 'PXL');
  const src = readFileSync(join(dir, 'issues', 'pxl-1.md'), 'utf8');
  assert.match(src, /^---\nfirst: true\nid: PXL-1\ntitle: New\n/);
  assert.match(src, /^blocked_by: \[\]\nestimate: 3\npriority: high\nsource: user\ncreated: /m);
  assert.match(src, /^updated: \S+\nmeta:\n {2}a:\n {4}- x\n {4}- y\ncomments:\n/m);
});

test('owned field values go in their slot on add, change in place on edit, and an empty one clears', () => {
  const estimate = { key: 'estimate', after: 'source' };
  const t = addIssue(new Ctx(dir), { title: 'n', project: 'PIX', fields: [{ field: estimate, value: '3' }, { field: { key: 'skip', after: 'id' }, value: '' }] });
  const file = join(dir, 'issues', 'pix-1.md');
  assert.match(readFileSync(file, 'utf8'), /^source: user\nestimate: "3"\ncreated: /m);
  assert.deepEqual(t.extra, [{ key: 'estimate', value: '3', after: 'source' }]);
  writeFileSync(file, readFileSync(file, 'utf8').replace('estimate: "3"\n', 'estimate: "3"\nlater: x\n'));
  editIssue(new Ctx(dir), 'PIX-1', { fields: [{ field: estimate, value: '5' }] });
  assert.match(readFileSync(file, 'utf8'), /^source: user\nestimate: "5"\nlater: x\ncreated: /m);
  editIssue(new Ctx(dir), 'PIX-1', { fields: [{ field: estimate, value: '' }] });
  assert.match(readFileSync(file, 'utf8'), /^source: user\nlater: x\ncreated: /m);
  assert.equal(addIssue(new Ctx(dir), { title: 'm', project: 'PIX', fields: [] }).extra, undefined);
});

test('a file with a non-plain unknown value is refused by every op, and its bytes stay unchanged', () => {
  createIssue(dir, issue());
  const bad = '---\nid: PIX-2\ntitle: x\nproject: PIX\nstatus: todo\nblocked_by: []\nsource: user\ncreated: 2026-10-01\nupdated: 2026-10-01\nbig: 12345678901234567890\n---\n';
  const file = join(dir, 'issues', 'pix-2.md');
  writeFileSync(file, bad);
  assert.throws(() => new Ctx(dir), /issues\/pix-2\.md: the value of unknown key "big"/);
  const ops: [string, (ctx: Ctx) => unknown][] = [
    ['setStatus', (c) => setStatus(c, 'PIX-1', 'doing')],
    ['addIssue', (c) => addIssue(c, { title: 'n', project: 'PIX' })],
    ['setPriority', (c) => setPriority(c, 'PIX-1', true)],
    ['editIssue', (c) => editIssue(c, 'PIX-1', { title: 'y' })],
    ['replaceBody', (c) => replaceBody(c, 'PIX-1', 'b')],
    ['addComment', (c) => addComment(c, 'PIX-1', 'hi', USER)],
    ['deleteIssue', (c) => deleteIssue(c, 'PIX-1', USER)],
    ['editProject', (c) => editProject(c, 'PIX', { name: 'n' })],
    ['setFocus', (c) => setFocus(c, 'PIX', true)],
    ['moveProject', (c) => moveProject(c, 'PIX', 'top')],
    ['addProject', (c) => addProject(c, { name: 'New one', paths: ['C:/y'] })],
    ['rekeyProject', (c) => rekeyProject(c, 'PIX', 'PXL')],
    ['addLog', (c) => addLog(c, { project: 'PIX', text: 'did' }, USER)],
  ];
  for (const [name, op] of ops) {
    assert.throws(() => op(new Ctx(dir, { lenient: true })), /^Error: not writing while files are bad: issues\/pix-2\.md \(the value of unknown key "big"/, name);
  }
  assert.equal(readFileSync(file, 'utf8'), bad);
  assert.ok(existsSync(join(dir, 'issues', 'pix-1.md')));
});
