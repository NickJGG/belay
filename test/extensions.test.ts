import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { BUILT_IN, matchesPattern, ownerOfPath } from '../src/extension-ids.ts';
import { attachedSessions, enabledExtensions, isActive, ownedFields, parseEnabled, type ExtensionManifest } from '../src/extensions.ts';
import { Ctx, setExtension } from '../src/ops.ts';
import { ISSUE_FIELDS, KNOWN_ISSUE_KEYS } from '../src/store.ts';

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'belay-'));
  mkdirSync(join(dir, 'projects'));
  mkdirSync(join(dir, 'issues'));
});

afterEach(() => rmSync(dir, { recursive: true, force: true }));

const settings = () => readFileSync(join(dir, 'settings.yaml'), 'utf8');

test('patterns match whole segments, with * for any one', () => {
  assert.equal(matchesPattern('/learn', '/learn'), true);
  assert.equal(matchesPattern('/learn/x/work', '/learn'), true);
  assert.equal(matchesPattern('/learning', '/learn'), false);
  assert.equal(matchesPattern('/api/s/abc/files/a.png', '/api/s/*/files'), true);
  assert.equal(matchesPattern('/api/s/abc/chat', '/api/s/*/files'), false);
  assert.equal(matchesPattern('/', '/learn'), false);
  assert.equal(ownerOfPath('/learn/x', ['grill', 'learn']), undefined);
});

test('the extensions map switches built-ins over their defaults, accepting on/off and true/false', () => {
  assert.deepEqual(parseEnabled(''), BUILT_IN);
  assert.deepEqual(parseEnabled('accent: iris\n'), { grill: true, learn: false });
  assert.deepEqual(parseEnabled('extensions:\n  learn: on\n  grill: off\n'), { grill: false, learn: true });
  assert.deepEqual(parseEnabled('extensions: { learn: true, grill: false, other: on }\n'), { grill: false, learn: true });
  assert.deepEqual(parseEnabled('extensions:\n  learn: maybe\n'), BUILT_IN);
  assert.throws(() => parseEnabled('extensions: on\n'), /not a map/);
  assert.throws(() => parseEnabled('extensions: [\n'));
});

test('the reader keeps the last good value through a broken file, and turns every built-in on if none was good', () => {
  assert.deepEqual(enabledExtensions(dir), BUILT_IN);
  writeFileSync(join(dir, 'settings.yaml'), 'extensions:\n  learn: on\n');
  assert.deepEqual(enabledExtensions(dir), { grill: true, learn: true });
  writeFileSync(join(dir, 'settings.yaml'), 'extensions: [\n');
  utimesSync(join(dir, 'settings.yaml'), new Date(), new Date(Date.now() + 5000));
  assert.deepEqual(enabledExtensions(dir), { grill: true, learn: true });

  const fresh = mkdtempSync(join(tmpdir(), 'belay-'));
  try {
    writeFileSync(join(fresh, 'settings.yaml'), 'extensions: [\n');
    assert.deepEqual(enabledExtensions(fresh), { grill: true, learn: true });
  } finally {
    rmSync(fresh, { recursive: true, force: true });
  }
});

test('every extension stays active until its gating lands, whatever the settings say', () => {
  writeFileSync(join(dir, 'settings.yaml'), 'extensions:\n  learn: off\n  grill: off\n');
  assert.equal(isActive('learn', dir), true);
  assert.equal(isActive('grill', dir), true);
});

test('owned fields may claim neither a core key nor another extension’s key', () => {
  const m = (id: 'grill' | 'learn', key: string): ExtensionManifest => ({ id, fields: [{ key, after: 'source' }], skills: [] });
  assert.deepEqual(ownedFields(ISSUE_FIELDS, [m('grill', 'x')]).map((f) => f.key), ['x']);
  assert.throws(() => ownedFields(ISSUE_FIELDS, [m('grill', 'title')]), /claims the core issue key 'title'/);
  assert.throws(() => ownedFields(ISSUE_FIELDS, [m('grill', 'x'), m('learn', 'x')]), /both claim the issue key 'x'/);
  assert.deepEqual(KNOWN_ISSUE_KEYS, [...ISSUE_FIELDS]);
});

test('switching an extension edits only its entry, keeping the other values and comments', () => {
  writeFileSync(join(dir, 'settings.yaml'), '# look\naccent: iris # the colour\ntheme: system\n');
  assert.equal(setExtension(new Ctx(dir), 'learn', true), true);
  assert.equal(settings(), '# look\naccent: iris # the colour\ntheme: system\nextensions:\n  learn: on\n');
  assert.equal(setExtension(new Ctx(dir), 'learn', true), false);
  assert.equal(setExtension(new Ctx(dir), 'grill', false), true);
  assert.equal(settings(), '# look\naccent: iris # the colour\ntheme: system\nextensions:\n  learn: on\n  grill: off\n');
  assert.deepEqual(enabledExtensions(dir), { grill: false, learn: true });
});

test('switching creates settings.yaml when there is none', () => {
  setExtension(new Ctx(dir), 'learn', false);
  assert.equal(settings(), 'extensions:\n  learn: off\n');
});

test('switching learn off drops a queued lesson start', () => {
  mkdirSync(join(dir, '.run'));
  writeFileSync(join(dir, '.run', 'start.json'), '{}');
  setExtension(new Ctx(dir), 'grill', false);
  assert.equal(existsSync(join(dir, '.run', 'start.json')), true);
  setExtension(new Ctx(dir), 'learn', false);
  assert.equal(existsSync(join(dir, '.run', 'start.json')), false);
});

test('switching refuses a settings.yaml it cannot parse, or whose extensions is not a map', () => {
  writeFileSync(join(dir, 'settings.yaml'), 'accent: [\n');
  assert.throws(() => setExtension(new Ctx(dir), 'learn', true), /settings.yaml/);
  assert.equal(settings(), 'accent: [\n');
  writeFileSync(join(dir, 'settings.yaml'), 'extensions: on\n');
  assert.throws(() => setExtension(new Ctx(dir), 'learn', true), /not a map/);
  assert.equal(settings(), 'extensions: on\n');
});

test('switching refuses while an issue file is bad', () => {
  writeFileSync(join(dir, 'issues', 'x-1.md'), '---\nid: [\n---\n');
  assert.throws(() => setExtension(new Ctx(dir, { lenient: true }), 'learn', true), /not writing while files are bad/);
  assert.equal(existsSync(join(dir, 'settings.yaml')), false);
});

function bridge(root: string, slug: string, b: object) {
  mkdirSync(join(dir, root, slug), { recursive: true });
  writeFileSync(join(dir, root, slug, 'bridge.json'), JSON.stringify(b));
}

test('a session counts as attached only while its pid is alive and its port answers', async () => {
  const server = createServer((_, res) => res.end()).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  const { port } = server.address() as AddressInfo;
  try {
    bridge('lessons', 'lesson-a', { port, token: 't', pid: process.pid });
    bridge('lessons', 'lesson-dead', { port, token: 't', pid: 2 ** 22 + 1 });
    bridge('grills', 'g', { port: 1, token: 't', pid: process.pid });
    mkdirSync(join(dir, 'lessons', 'lesson-none'));
    assert.deepEqual(await attachedSessions(dir, 'learn'), ['lesson-a']);
    assert.deepEqual(await attachedSessions(dir, 'grill'), []);
  } finally {
    server.close();
  }
});

function belay(...args: string[]) {
  const r = spawnSync(process.execPath, [join(import.meta.dirname, '..', 'src', 'cli.ts'), ...args], {
    encoding: 'utf8',
    env: { ...process.env, BELAY_DATA: dir, CLAUDECODE: '' },
  });
  return { code: r.status, out: r.stdout, err: r.stderr };
}

test('belay extension switches, and refuses off while a session of that kind is attached', async () => {
  assert.equal(belay('extension', 'on', 'learn').out, 'learn on\n');
  assert.equal(belay('extension', 'on', 'learn').out, 'learn was already on\n');
  assert.match(belay('extension', 'off', 'nope').err, /no extension 'nope'/);
  assert.match(belay('extension', 'up', 'learn').err, /expected on or off/);

  const server = createServer((_, res) => res.end()).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  try {
    bridge('lessons', 'lesson-a', { port: (server.address() as AddressInfo).port, token: 't', pid: process.pid });
    const r = await new Promise<{ code: number | null; err: string }>((resolve) => {
      const child = spawnAsync('extension', 'off', 'learn');
      let err = '';
      child.stderr.on('data', (d) => (err += d));
      child.on('close', (code) => resolve({ code, err }));
    });
    assert.equal(r.code, 1);
    assert.match(r.err, /a learn session is attached \(lesson-a\)/);
    assert.match(settings(), /learn: on/);
  } finally {
    server.close();
  }
});

// The server lives in this process, so the CLI must run alongside it rather than block it.
function spawnAsync(...args: string[]) {
  return spawn(process.execPath, [join(import.meta.dirname, '..', 'src', 'cli.ts'), ...args], { env: { ...process.env, BELAY_DATA: dir, CLAUDECODE: '' } });
}
