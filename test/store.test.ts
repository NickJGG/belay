import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import {
  ISSUE_FIELDS,
  createIssue,
  entityForPath,
  issueCacheFile,
  loadOrder,
  loadProjects,
  loadIssues,
  nextIssueNumber,
  parseProject,
  parseIssue,
  saveProject,
  serializeProject,
  serializeIssue,
  sortByOrder,
  unknownKeys,
  validateKey,
  type BadFile,
  type Project,
  type Issue,
} from '../src/store.ts';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'belay-'));
  mkdirSync(join(dir, 'projects'));
  mkdirSync(join(dir, 'issues'));
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

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

test('issue frontmatter round-trips, including optional fields and body', () => {
  const t: Issue = {
    id: 'PIX-3',
    ...issue({ priority: 'high', grill: 'some-slug', plan: 'C:/plans/x.md', blocked_by: ['PIX-1'], title: '2048: "quoted" title' }),
    body: 'notes\n\n- 2026-10-02: more',
  };
  assert.deepEqual(parseIssue(serializeIssue(t), 'x'), t);
});

test('serialized issue omits unset optional fields', () => {
  const src = serializeIssue({ id: 'PIX-1', ...issue() });
  assert.doesNotMatch(src, /priority|grill|plan|comments/);
  assert.match(src, /^blocked_by: \[\]$/m);
});

test('comments round-trip after updated, with multi-line text as a block scalar', () => {
  const t: Issue = {
    id: 'PIX-1',
    ...issue({
      comments: [
        { at: '2026-10-04T09:05', by: 'claude', session: 'abc-123', text: 'Phase 1 done.\n\n- left: docs\n- key: value' },
        { at: '2026-10-04T10:00', by: 'user', text: 'ok: thanks' },
      ],
    }),
    body: 'desc',
  };
  const src = serializeIssue(t);
  assert.deepEqual(parseIssue(src, 'x').comments, t.comments);
  assert.match(src, /^updated: 2026-10-01\ncomments:\n {2}- at: 2026-10-04T09:05\n/m);
  assert.match(src, /^ {4}text: \|-\n {6}Phase 1 done\.\n\n {6}- left: docs$/m);
});

test('a file without comments re-serializes byte-identical', () => {
  const src = '---\nid: PIX-1\ntitle: x\nproject: PIX\nstatus: todo\nblocked_by: []\nsource: user\ncreated: 2026-10-01\nupdated: 2026-10-01\n---\n\nbody\n';
  assert.equal(serializeIssue(parseIssue(src, 'x')), src);
});

test('parse rejects bad comments with the file and comment number', () => {
  const head = '---\nid: pi-1\nproject: pi\ntitle: x\nstatus: todo\ncreated: a\nupdated: a\n';
  const bad = (comments: string) => () => parseIssue(`${head}comments: ${comments}\n---\n`, 'issues/pi-1.md');
  assert.throws(bad('nope'), /issues\/pi-1\.md: 'comments' must be a list/);
  assert.throws(bad('[x]'), /issues\/pi-1\.md comment #1: not a mapping/);
  assert.throws(bad('[{at: 2026-10-04, by: user, text: t}]'), /comment #1: 'at' must be YYYY-MM-DDTHH:MM/);
  assert.throws(bad('[{at: "2026-10-04T09:00", by: system, text: t}]'), /comment #1: 'by' must be one of user\|claude/);
  assert.throws(bad('[{at: "2026-10-04T09:00", by: user, text: t}, {at: "2026-10-04T09:00", by: user, text: " "}]'), /comment #2: 'text' must be a non-empty string/);
  assert.throws(bad('[{at: "2026-10-04T09:00", by: user}]'), /comment #1: 'text'/);
});

test('project round-trips', () => {
  const p: Project = { key: 'ELV', name: 'Elevators', paths: ['C:/a', 'C:/b c'], status: 'paused', focus: true, group: 'PZ Mods', body: 'hello' };
  assert.deepEqual(parseProject(serializeProject(p), 'x'), p);
});

test('project icon round-trips, and is omitted when unset', () => {
  const p: Project = { key: 'BEL', name: 'Belay', paths: ['C:/b'], status: 'active', focus: false, group: undefined, icon: 'web/public/icon.svg', body: '' };
  assert.match(serializeProject(p), /^icon: web\/public\/icon\.svg$/m);
  assert.deepEqual(parseProject(serializeProject(p), 'x'), p);
  const { icon: _, ...bare } = p;
  assert.doesNotMatch(serializeProject(bare), /icon/);
  assert.equal('icon' in parseProject(serializeProject(bare), 'x'), false);
});

test('project kinds round-trip; unset ones are omitted', () => {
  const base: Project = { key: 'JOB', name: 'Job search', paths: [], status: 'active', focus: true, group: undefined, body: '' };
  const p: Project = { ...base, kinds: ['applied', 'outreach'] };
  assert.deepEqual(parseProject(serializeProject(p), 'x'), p);
  assert.doesNotMatch(serializeProject({ ...base, kinds: [] }), /kinds/);
  assert.deepEqual(parseProject(serializeProject({ ...base, kinds: [] }), 'x'), base);
});

test('a stray goal key is ignored and dropped on save', () => {
  const p = parseProject('---\nkey: JOB\nname: Job\ngoal: {habit: 5}\n---\n', 'f');
  assert.equal('goal' in p, false);
  assert.doesNotMatch(serializeProject(p), /goal/);
});

test('projects drop unknown keys on save, plain ones included', () => {
  const p = parseProject('---\nkey: JOB\nname: Job\nestimate: 3\ntags: [a]\n---\n', 'f');
  assert.equal(serializeProject(p), '---\nkey: JOB\nname: Job\npaths: []\nstatus: active\nfocus: false\n---\n');
});

/** An issue file in canonical form, with `pre` before `id` and `post` after `updated`. */
const fixture = (pre = '', post = '', mid = '') =>
  `---\n${pre}id: FXT-1\ntitle: Fixture\nproject: FXT\nstatus: idea\nblocked_by: []\n${mid}source: claude\ncreated: 2026-01-01\nupdated: 2026-01-01T09:00\n${post}---\n`;

const PLAIN: Record<string, [string, string]> = {
  scalars: ['', 'estimate: 3\nnote: hello\n'],
  nested: ['', 'meta:\n  a: 1\n  b:\n    - x\n    - y\n'],
  list: ['', 'tags:\n  - a\n  - b\n'],
  'integer-named key': ['', '2: two\n'],
  'key before id': ['first: true\n', ''],
};

const NON_PLAIN: Record<string, [string, RegExp]> = {
  '.inf': ['x: .inf\n', /"x" wouldn't survive a save exactly: quote it/],
  alias: ['a: &x foo\nb: *x\n', /"b" is an alias/],
  '20-digit integer': ['big: 12345678901234567890\n', /"big" wouldn't survive a save exactly/],
  '-0': ['z: -0\n', /"z" wouldn't survive a save exactly/],
  '!!set': ['s: !!set {a: null}\n', /"s" has the tag !!set/],
  '!!omap': ['o: !!omap [ {a: 1} ]\n', /"o" has the tag !!omap/],
  '!!binary': ['bin: !!binary aGVsbG8=\n', /"bin" has the tag !!binary/],
  '!!timestamp': ['ts: !!timestamp 2026-01-01\n', /"ts" has the tag !!timestamp/],
  'custom tag': ['c: !custom foo\n', /"c" has the tag !custom/],
  __proto__: ['__proto__:\n  polluted: true\n', /"__proto__" is reserved: rename it/],
  'nested number key': ['m:\n  1: a\n', /"m" wouldn't survive a save exactly/],
  'nested tag': ['m:\n  - !!binary aGVsbG8=\n', /"m" has the tag !!binary/],
};

test('plain unknown keys survive a save byte for byte, keeping their place and scalar types', () => {
  for (const [name, [pre, post]] of Object.entries(PLAIN)) {
    const src = fixture(pre, post);
    assert.equal(serializeIssue(parseIssue(src, 'f')), src, name);
  }
  assert.deepEqual(parseIssue(fixture('', '2: two\n'), 'f').extra, [{ key: 2, value: 'two', after: 'updated' }]);
  assert.deepEqual(parseIssue(fixture('first: true\n'), 'f').extra, [{ key: 'first', value: true, after: null }]);
  assert.match(serializeIssue(parseIssue(fixture('', '"2": two\n'), 'f')), /^"2": two$/m);
});

test('unknown values that a save would change make the file bad, saying what to quote', () => {
  for (const [name, [post, error]] of Object.entries(NON_PLAIN)) {
    assert.throws(() => parseIssue(fixture('', post), 'issues/fxt-1.md'), (e: Error) => error.test(e.message) && e.message.startsWith('issues/fxt-1.md: '), name);
  }
  assert.throws(() => parseIssue(fixture('', '? [a]\n: b\n'), 'f'), /unknown key "\[\\"a\\"\]" is not text or a number: quote the key/);
  const bad: BadFile[] = [];
  writeFileSync(join(dir, 'issues', 'fxt-1.md'), fixture('', 'z: -0\n'));
  assert.deepEqual(loadIssues(dir, { bad }), []);
  assert.match(bad[0].error, /^the value of unknown key "z"/);
});

test('extra keys follow their anchor; with it gone, the nearest set field before it; runs keep their order', () => {
  const src = fixture('', 'tail: 1\n', 'after_blocked: a\npriority: high\nafter_priority: b\nrun: c\n');
  const t = parseIssue(src, 'f');
  assert.deepEqual(t.extra?.map((e) => [e.key, e.after]), [['after_blocked', 'blocked_by'], ['after_priority', 'priority'], ['run', 'priority'], ['tail', 'updated']]);
  assert.equal(serializeIssue(t), src);
  const dropped = serializeIssue({ ...t, priority: undefined });
  assert.match(dropped, /^blocked_by: \[\]\nafter_blocked: a\nafter_priority: b\nrun: c\nsource: claude$/m);
  assert.match(serializeIssue({ ...t, comments: [{ at: '2026-01-02T09:00', by: 'user', text: 'hi' }] }), /^updated: 2026-01-01T09:00\ntail: 1\ncomments:$/m);
});

test('a non-canonical file with unknown keys becomes canonical on its first save, then stays put', () => {
  const src = '---\ntitle: Fixture\nodd: 1\nid: fxt-1\nstatus: idea\nproject: FXT\ncreated: 2026-01-01\nupdated: 2026-01-01\n---\n';
  const once = serializeIssue(parseIssue(src, 'f'));
  assert.equal(once, '---\nid: FXT-1\ntitle: Fixture\nodd: 1\nproject: FXT\nstatus: idea\nblocked_by: []\nsource: user\ncreated: 2026-01-01\nupdated: 2026-01-01\n---\n');
  assert.equal(serializeIssue(parseIssue(once, 'f')), once);
});

test('unknownKeys lists the extra keys outside the known set', () => {
  const t = parseIssue(fixture('first: true\n', '2: two\nnote: x\n'), 'f');
  assert.deepEqual(unknownKeys(t, ISSUE_FIELDS), ['first', '2', 'note']);
  assert.deepEqual(unknownKeys(t, [...ISSUE_FIELDS, 'note']), ['first', '2']);
  assert.deepEqual(unknownKeys(parseIssue(fixture(), 'f'), ISSUE_FIELDS), []);
});

test('unknown keys survive cold and warm loads', () => {
  const file = join(dir, 'issues', 'fxt-1.md');
  for (const [name, [pre, post]] of Object.entries(PLAIN)) {
    const src = fixture(pre, post);
    writeFileSync(file, src);
    rmSync(join(dir, 'cache'), { recursive: true, force: true });
    const cold = loadIssues(dir);
    const warm = loadIssues(dir);
    assert.equal(serializeIssue(cold[0]), src, `${name}: cold`);
    assert.equal(serializeIssue(warm[0]), src, `${name}: warm`);
    assert.ok(cacheFiles()['issues/fxt-1.md'], `${name}: cached`);
  }
});

test('issue cache: entries from before extra keys (integer version) are ignored', () => {
  writeFileSync(join(dir, 'issues', 'fxt-1.md'), fixture('', 'note: kept\n'));
  loadIssues(dir);
  const cache = JSON.parse(readFileSync(issueCacheFile(dir), 'utf8'));
  assert.equal(typeof cache.version, 'string');
  delete cache.files['issues/fxt-1.md'].issue.extra;
  writeFileSync(issueCacheFile(dir), JSON.stringify({ ...cache, version: 1 }));
  assert.match(serializeIssue(loadIssues(dir)[0]), /^note: kept$/m);
});

/** Read-only, over a copy of the data dir: never point this at the real `~/Belay` (see AGENTS.md). */
test('every issue in $BELAY_DATA re-serializes byte-identically', { skip: !process.env.BELAY_DATA && 'set BELAY_DATA to a copy of the data dir' }, () => {
  const issues = join(process.env.BELAY_DATA!, 'issues');
  const files = readdirSync(issues).filter((f) => f.endsWith('.md'));
  const differ: string[] = [];
  for (const f of files) {
    const src = readFileSync(join(issues, f), 'utf8');
    try {
      if (serializeIssue(parseIssue(src, f)) !== src) differ.push(f);
    } catch {
      // bad files are reported by `belay check`, not here
    }
  }
  assert.deepEqual(differ, []);
});

test('issue transitions round-trip and are validated', () => {
  const t: Issue = {
    id: 'PIX-3',
    ...issue({
      priority: undefined,
      grill: undefined,
      plan: undefined,
      transitions: [
        { at: '2026-10-01T09:00', to: 'todo', by: 'user' },
        { at: '2026-10-02T10:30', from: 'todo', to: 'doing', by: 'claude', session: 's1' },
      ],
    }),
  };
  assert.deepEqual(parseIssue(serializeIssue(t), 'x'), t);
  const bad = (tr: string) => () => parseIssue(`---\nid: PIX-1\nproject: PIX\ntitle: x\nstatus: todo\ncreated: a\nupdated: a\ntransitions: ${tr}\n---\n`, 'f');
  assert.throws(bad('{}'), /'transitions' must be a list/);
  assert.throws(bad('[{at: 2026-10-01, to: todo, by: user}]'), /transition #1: 'at'/);
  assert.throws(bad('[{at: "2026-10-01T09:00", to: blocked, by: user}]'), /transition #1: 'to' must be one of/);
  assert.throws(bad('[{at: "2026-10-01T09:00", from: nope, to: todo, by: user}]'), /'from' must be one of/);
});

test('lowercase and long pre-rule keys load uppercased', () => {
  const t = parseIssue('---\nid: pz-elevators-2\nproject: pz-elevators\ntitle: x\nstatus: todo\nblocked_by: [pz-elevators-1]\ncreated: a\nupdated: a\n---\n', 'f');
  assert.deepEqual([t.id, t.project, t.blocked_by], ['PZ-ELEVATORS-2', 'PZ-ELEVATORS', ['PZ-ELEVATORS-1']]);
  assert.equal(parseProject('---\nkey: pz-elevators\nname: x\n---\n', 'f').key, 'PZ-ELEVATORS');
});

test('new keys must be 3–4 letters', () => {
  for (const ok of ['ELV', 'PORT']) validateKey(ok);
  for (const bad of ['EL', 'PORTF', 'EL1', 'pz-elevators', 'elv']) assert.throws(() => validateKey(bad), /3–4 letters/, bad);
});

test('parse rejects bad fields with the file name', () => {
  assert.throws(() => parseIssue('---\nid: pi-1\nproject: pi\ntitle: x\nstatus: blocked\ncreated: a\nupdated: a\n---\n', 'issues/pi-1.md'), /issues\/pi-1\.md: 'status'/);
  assert.throws(() => parseIssue('---\nid: pi-1\nproject: dono\ntitle: x\nstatus: todo\ncreated: a\nupdated: a\n---\n', 'f'), /does not match project/);
  assert.throws(() => parseIssue('no frontmatter', 'f'), /missing frontmatter/);
  assert.throws(() => parseProject('---\nkey: Bad_Key\nname: x\n---\n', 'f'), /invalid project key/);
});

test('hand-written files with CRLF parse', () => {
  const t = parseIssue('---\r\nid: pi-1\r\nproject: pi\r\ntitle: x\r\nstatus: idea\r\ncreated: 2026-10-01\r\nupdated: 2026-10-01\r\n---\r\n\r\nbody\r\n', 'f');
  assert.equal(t.status, 'idea');
  assert.equal(t.source, 'user');
  assert.deepEqual(t.blocked_by, []);
  assert.equal(t.body, 'body');
});

test('IDs: max existing n for the key, + 1, ignoring other keys and gaps', () => {
  assert.equal(nextIssueNumber(dir, 'PIX'), 1);
  writeFileSync(join(dir, 'issues', 'pix-2.md'), '');
  writeFileSync(join(dir, 'issues', 'pix-10.md'), '');
  writeFileSync(join(dir, 'issues', 'pix-ext-50.md'), '');
  writeFileSync(join(dir, 'issues', 'dono-99.md'), '');
  assert.equal(nextIssueNumber(dir, 'PIX'), 11);
  assert.equal(nextIssueNumber(dir, 'PIX-EXT'), 51);
  assert.equal(nextIssueNumber(dir, 'DONO'), 100);
});

test('createIssue allocates sequential IDs and writes files that load back', () => {
  const a = createIssue(dir, issue({ title: 'a' }));
  const b = createIssue(dir, issue({ title: 'b' }));
  const c = createIssue(dir, issue({ title: 'c', project: 'DON' }));
  assert.deepEqual([a.id, b.id, c.id], ['PIX-1', 'PIX-2', 'DON-1']);
  assert.deepEqual(loadIssues(dir).map((t) => t.id), ['DON-1', 'PIX-1', 'PIX-2']);
  assert.match(readFileSync(join(dir, 'issues', 'pix-2.md'), 'utf8'), /^id: PIX-2$/m);
});

test('loadIssues sorts numerically and checks file names', () => {
  for (const n of [10, 2, 1]) createIssue(dir, issue({ title: `t${n}` }));
  assert.deepEqual(loadIssues(dir).map((t) => t.id), ['PIX-1', 'PIX-2', 'PIX-3']);
  writeFileSync(join(dir, 'issues', 'pix-9.md'), serializeIssue({ id: 'PIX-8', ...issue() }));
  assert.throws(() => loadIssues(dir), /issues\/pix-9\.md: id 'PIX-8' does not match file name/);
});

test('saveProject + loadProjects', () => {
  saveProject(dir, { key: 'PIX', name: 'Pixel Imperium', paths: ['C:/x'], status: 'active', focus: false, body: '' });
  assert.equal(loadProjects(dir)[0].name, 'Pixel Imperium');
  assert.ok(existsSync(join(dir, 'projects', 'pix.md')));
});

test('entityForPath: issue and project files, either separator, not temp files', () => {
  assert.deepEqual(entityForPath('issues/elv-1.md'), { kind: 'issue', id: 'ELV-1' });
  assert.deepEqual(entityForPath('projects\\elv.md'), { kind: 'project', id: 'ELV' });
  assert.equal(entityForPath('issues/a-1.md.123.tmp'), undefined);
  assert.equal(entityForPath('settings.yaml'), undefined);
  assert.equal(entityForPath('issues'), undefined);
});

test('sortByOrder puts listed keys first in list order, then unlisted by key, ignoring stale keys', () => {
  const p = (key: string): Project => ({ key, name: key, paths: [], status: 'active', focus: false, body: '' });
  const projects = ['DDD', 'AAA', 'CCC', 'BBB'].map(p);
  assert.deepEqual(sortByOrder(projects, ['CCC', 'GONE', 'AAA']).map((x) => x.key), ['CCC', 'AAA', 'BBB', 'DDD']);
  assert.deepEqual(sortByOrder(projects, []).map((x) => x.key), ['AAA', 'BBB', 'CCC', 'DDD']);
});

test('loadOrder: missing file is empty, keys are canonicalised, bad shapes throw', () => {
  assert.deepEqual(loadOrder(dir), []);
  writeFileSync(join(dir, 'order.yaml'), 'project_order: [elv, " Pix "]');
  assert.deepEqual(loadOrder(dir), ['ELV', 'PIX']);
  writeFileSync(join(dir, 'order.yaml'), 'project_order: [1, 2]');
  assert.throws(() => loadOrder(dir), /order.yaml: 'project_order' must be a list of strings/);
  writeFileSync(join(dir, 'order.yaml'), '- ELV');
  assert.throws(() => loadOrder(dir), /order.yaml: not a mapping/);
});

test('a yaml error names the file and its line in the file', () => {
  writeFileSync(join(dir, 'issues', 'pix-1.md'), '---\nid: PIX-1\nproject: PIX\ntitle: a: b: c\n---\n');
  assert.throws(() => loadIssues(dir), /^Error: issues\/pix-1\.md: line 4: Nested mappings are not allowed in compact mappings$/);
  writeFileSync(join(dir, 'order.yaml'), 'project_order: [PIX\n');
  assert.throws(() => loadOrder(dir), /^Error: order\.yaml: line \d+: /);
});

test('lenient loads skip bad files and collect them; strict ones throw', () => {
  createIssue(dir, issue());
  writeFileSync(join(dir, 'issues', 'pix-2.md'), 'no frontmatter');
  saveProject(dir, { key: 'PIX', name: 'Pixel', paths: [], status: 'active', focus: false, body: '' });
  writeFileSync(join(dir, 'projects', 'don.md'), '---\nkey: DON\n---\n');
  assert.throws(() => loadIssues(dir), /issues\/pix-2\.md: missing frontmatter/);
  assert.throws(() => loadProjects(dir), /projects\/don\.md: 'name' must be a non-empty string/);
  const bad: BadFile[] = [];
  assert.deepEqual(loadIssues(dir, { bad }).map((t) => t.id), ['PIX-1']);
  assert.deepEqual(loadProjects(dir, { bad }).map((p) => p.key), ['PIX']);
  assert.deepEqual(bad, [
    { file: 'issues/pix-2.md', error: 'missing frontmatter' },
    { file: 'projects/don.md', error: "'name' must be a non-empty string" },
  ]);
});

const cacheFiles = () => JSON.parse(readFileSync(issueCacheFile(dir), 'utf8')).files;

test('issue cache: a hit skips parsing, a changed file is re-read', () => {
  createIssue(dir, issue({ title: 'aaaa' }));
  loadIssues(dir);
  const cache = JSON.parse(readFileSync(issueCacheFile(dir), 'utf8'));
  cache.files['issues/pix-1.md'].issue.title = 'from cache';
  writeFileSync(issueCacheFile(dir), JSON.stringify(cache));
  assert.equal(loadIssues(dir)[0].title, 'from cache');

  const file = join(dir, 'issues', 'pix-1.md');
  writeFileSync(file, readFileSync(file, 'utf8').replace('aaaa', 'bbbb'));
  utimesSync(file, new Date(2026, 0, 1), new Date(2026, 0, 1));
  assert.equal(loadIssues(dir)[0].title, 'bbbb', 'same size, new mtime');
  writeFileSync(file, readFileSync(file, 'utf8').replace('bbbb', 'longer'));
  utimesSync(file, new Date(2026, 0, 1), new Date(2026, 0, 1));
  assert.equal(loadIssues(dir)[0].title, 'longer', 'same mtime, new size');
  assert.equal(cacheFiles()['issues/pix-1.md'].issue.title, 'longer');
});

test('issue cache: deleted files drop out, bad files are never cached', () => {
  createIssue(dir, issue());
  createIssue(dir, issue());
  loadIssues(dir);
  assert.deepEqual(Object.keys(cacheFiles()).sort(), ['issues/pix-1.md', 'issues/pix-2.md']);
  rmSync(join(dir, 'issues', 'pix-2.md'));
  writeFileSync(join(dir, 'issues', 'pix-3.md'), 'no frontmatter');
  assert.deepEqual(loadIssues(dir, { bad: [] }).map((t) => t.id), ['PIX-1']);
  assert.deepEqual(Object.keys(cacheFiles()), ['issues/pix-1.md']);
});

test('issue cache: a corrupt cache file is ignored and rebuilt', () => {
  createIssue(dir, issue());
  mkdirSync(join(dir, 'cache'));
  writeFileSync(issueCacheFile(dir), '{not json');
  assert.deepEqual(loadIssues(dir).map((t) => t.id), ['PIX-1']);
  assert.deepEqual(Object.keys(cacheFiles()), ['issues/pix-1.md']);
});
