import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { bundled, installedIds, isExtensionId, ownerOfPath, parseInfo, REPO } from '../src/extension-ids.ts';
import { generate } from '../src/generate.ts';

let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'belay-root-'));
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

const info = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  name: id,
  summary: `${id} things`,
  mark: { path: 'M0 0', dot: { x: 1, y: 2, r: 3 } },
  fields: [],
  paths: [`/${id}`],
  sessions: `${id}s`,
  ...over,
});

function extension(folder: string, json: unknown) {
  mkdirSync(join(root, 'extensions', folder), { recursive: true });
  writeFileSync(join(root, 'extensions', folder, 'belay.json'), typeof json === 'string' ? json : JSON.stringify(json));
}

const ids = () => bundled(root).map((e) => e.id);

test("the repo's bundled extensions are grill, learn and review, with today's fields, paths and session folders", () => {
  assert.deepEqual(
    bundled(REPO).map((e) => [e.id, e.fields, e.sessions, e.history]),
    [
      ['grill', [{ key: 'grill', after: 'source' }, { key: 'plan', after: 'grill' }], 'grills', true],
      ['learn', [], 'lessons', false],
      ['review', [], 'reviews', false],
    ],
  );
  assert.equal(ownerOfPath('/p/BEL/grills', ['grill', 'learn']), 'grill');
});

test('discovery finds each folder with a belay.json, sorted, and skips folders without one', () => {
  assert.deepEqual(ids(), []);
  extension('zeta', info('zeta'));
  extension('alpha', info('alpha', { fields: [{ key: 'estimate', after: 'source' }], history: true }));
  mkdirSync(join(root, 'extensions', 'empty'));
  writeFileSync(join(root, 'extensions', 'installed.json'), '{"installed":[]}');
  assert.deepEqual(ids(), ['alpha', 'zeta']);
  const [alpha, zeta] = bundled(root);
  assert.deepEqual(alpha.fields, [{ key: 'estimate', after: 'source' }]);
  assert.equal(alpha.history, true);
  assert.equal(zeta.history, false);
  assert.equal(isExtensionId('alpha', root), true);
  assert.equal(isExtensionId('empty', root), false);
});

test('discovery re-reads a belay.json once it changes, and sees a new folder', () => {
  extension('a', info('a'));
  assert.equal(bundled(root)[0].name, 'a');
  extension('a', info('a', { name: 'Renamed!' }));
  utimesSync(join(root, 'extensions', 'a', 'belay.json'), new Date(), new Date(Date.now() + 5000));
  assert.equal(bundled(root)[0].name, 'Renamed!');
  extension('b', info('b'));
  assert.deepEqual(ids(), ['a', 'b']);
});

test('a belay.json must be valid for its folder', () => {
  const bad = (over: Record<string, unknown>, why: RegExp, folder = 'x') => assert.throws(() => parseInfo(JSON.stringify(info('x', over)), folder), why);
  assert.throws(() => parseInfo('{', 'x'), /^Error: extensions\/x\/belay.json: /);
  bad({ id: 'X' }, /'id' must match/, 'X');
  bad({ id: '../x' }, /'id' must match/);
  bad({}, /'id' is 'x', not its folder's name/, 'y');
  bad({ name: '' }, /'name' must be a non-empty string/);
  bad({ summary: 3 }, /'summary' must be a non-empty string/);
  bad({ mark: { path: 'M0' } }, /'mark' must be/);
  bad({ fields: [{ key: 'k' }] }, /'fields' must be a list of \{ key, after \}/);
  bad({ paths: ['learn'] }, /'paths' must be a list of paths starting with \//);
  bad({ sessions: '../x' }, /'sessions' must be a folder name of its own/);
  bad({ sessions: 'issues' }, /'sessions' must be a folder name of its own/);
  bad({ history: 'yes' }, /'history' must be true or false/);
});

test('two extensions may not claim one issue key or one session folder', () => {
  extension('a', info('a', { fields: [{ key: 'k', after: 'source' }] }));
  extension('b', info('b', { fields: [{ key: 'k', after: 'source' }] }));
  assert.throws(() => bundled(root), /extensions 'a' and 'b' both claim the issue key 'k'/);
  extension('b', info('b', { sessions: 'as' }));
  utimesSync(join(root, 'extensions', 'b', 'belay.json'), new Date(), new Date(Date.now() + 5000));
  assert.throws(() => bundled(root), /extensions 'a' and 'b' both keep sessions in 'as'/);
});

test('with no record none is installed; a record lists the installed ones, ignoring unbundled ids', () => {
  extension('a', info('a'));
  extension('b', info('b'));
  assert.deepEqual(installedIds(root), []);
  const record = join(root, 'extensions', 'installed.json');
  writeFileSync(record, JSON.stringify({ installed: ['b', 'gone'] }));
  assert.deepEqual(installedIds(root), ['b']);
  writeFileSync(record, JSON.stringify({ installed: [] }));
  utimesSync(record, new Date(), new Date(Date.now() + 5000));
  assert.deepEqual(installedIds(root), []);
  writeFileSync(record, '["a"]');
  utimesSync(record, new Date(), new Date(Date.now() + 10000));
  assert.throws(() => installedIds(root), /expected \{ "installed": \[<id>, …\] \}/);
});

test("paths belong to the first listed extension whose belay.json claims them", () => {
  extension('a', info('a', { paths: ['/a', '/p/*/as'] }));
  assert.equal(ownerOfPath('/p/X/as/1', ['a'], root), 'a');
  assert.equal(ownerOfPath('/p/X', ['a'], root), undefined);
  assert.equal(ownerOfPath('/a', ['nope'], root), undefined);
});

const ISSUE = (mid: string) =>
  `---\nid: PIX-1\ntitle: Do the thing\nproject: PIX\nstatus: todo\nblocked_by: []\nsource: user\n${mid}created: 2026-10-01\nupdated: 2026-10-01T09:00\n---\n`;

test("an issue's grill fields survive saves byte for byte in a clone without the grill extension", () => {
  const clone = join(root, 'clone');
  cpSync(join(REPO, 'src'), join(clone, 'src'), { recursive: true });
  cpSync(join(REPO, 'package.json'), join(clone, 'package.json'));
  cpSync(join(REPO, 'extensions', 'learn'), join(clone, 'extensions', 'learn'), { recursive: true });
  symlinkSync(join(REPO, 'node_modules'), join(clone, 'node_modules'), 'junction');
  generate(clone);
  const data = join(root, 'data');
  mkdirSync(join(data, 'projects'), { recursive: true });
  mkdirSync(join(data, 'issues'));
  writeFileSync(join(data, 'projects', 'pix.md'), '---\nkey: PIX\nname: Pixel\npaths: []\nstatus: active\nfocus: false\n---\n');
  const file = join(data, 'issues', 'pix-1.md');
  writeFileSync(file, ISSUE('grill: some-slug\nplan: C:/plans/x.md\n'));
  const belay = (...args: string[]) =>
    spawnSync(process.execPath, [join(clone, 'src', 'cli.ts'), ...args], { encoding: 'utf8', env: { ...process.env, BELAY_DATA: data, CLAUDECODE: '' } });

  assert.match(belay('check').stdout, /^  PIX-1  grill, plan$/m);
  assert.doesNotMatch(belay('show', 'PIX-1').stdout, /^grill:/m);
  const edit = belay('edit', 'PIX-1', '--title', 'Renamed', '--priority', 'high');
  assert.equal(edit.status, 0, edit.stderr);
  belay('edit', 'PIX-1', '--priority', 'none');
  const after = readFileSync(file, 'utf8').replace(/^updated: .*$/m, 'updated: 2026-10-01T09:00');
  assert.equal(after, ISSUE('grill: some-slug\nplan: C:/plans/x.md\n').replace('Do the thing', 'Renamed'));
  assert.match(belay('edit', 'PIX-1', '--grill', 'g').stderr, /Unknown option '--grill'/);
});
