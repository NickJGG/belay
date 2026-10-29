import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { matchesPattern, ownerOfPath, type OwnedField } from '../src/extension-ids.ts';
import {
  ATTACHED_SCAN_MS,
  attachedSessions,
  enabledExtensions,
  fieldLines,
  fieldValues,
  isActive,
  ownedFields,
  parseEnabled,
  withFieldOptions,
} from '../src/extensions.ts';
import { Ctx, setExtension, switchExtension } from '../src/ops.ts';
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
  assert.equal(ownerOfPath('/learn/x', ['grill', 'learn']), 'learn');
});

const ALL_ON = { grill: true, learn: true };

test('the extensions map switches the installed extensions, each on unless it says off, accepting on/off and true/false', () => {
  assert.deepEqual(parseEnabled(''), ALL_ON);
  assert.deepEqual(parseEnabled('accent: iris\n'), ALL_ON);
  assert.deepEqual(parseEnabled('extensions:\n  learn: on\n  grill: off\n'), { grill: false, learn: true });
  assert.deepEqual(parseEnabled('extensions: { learn: true, grill: false, other: on }\n'), { grill: false, learn: true });
  assert.deepEqual(parseEnabled('extensions:\n  learn: maybe\n'), ALL_ON);
  assert.deepEqual(parseEnabled('extensions:\n  learn: off\n  grill: off\n', ['grill']), { grill: false }, "an uninstalled one's entry is ignored");
  assert.throws(() => parseEnabled('extensions: on\n'), /not a map/);
  assert.throws(() => parseEnabled('extensions: [\n'));
});

test('the reader keeps the last good value through a broken file, and turns every installed one on if none was good', () => {
  assert.deepEqual(enabledExtensions(dir), ALL_ON);
  writeFileSync(join(dir, 'settings.yaml'), 'extensions:\n  learn: off\n');
  assert.deepEqual(enabledExtensions(dir), { grill: true, learn: false });
  writeFileSync(join(dir, 'settings.yaml'), 'extensions: [\n');
  utimesSync(join(dir, 'settings.yaml'), new Date(), new Date(Date.now() + 5000));
  assert.deepEqual(enabledExtensions(dir), { grill: true, learn: false });

  const fresh = mkdtempSync(join(tmpdir(), 'belay-'));
  try {
    writeFileSync(join(fresh, 'settings.yaml'), 'extensions: [\n');
    assert.deepEqual(enabledExtensions(fresh), { grill: true, learn: true });
  } finally {
    rmSync(fresh, { recursive: true, force: true });
  }
});

test('each installed extension follows its setting, on without one; an unbundled id is never active', () => {
  assert.equal(isActive('grill', dir), true);
  assert.equal(isActive('learn', dir), true);
  assert.equal(isActive('nope', dir), false);
  writeFileSync(join(dir, 'settings.yaml'), 'extensions:\n  learn: on\n  grill: off\n');
  assert.equal(isActive('grill', dir), false);
  assert.equal(isActive('learn', dir), true);
});

test('a switched-off extension stays active while one of its sessions has a live bridge, seen within a scan interval', (t) => {
  t.mock.timers.enable({ apis: ['Date'] });
  const scan = () => t.mock.timers.tick(ATTACHED_SCAN_MS);
  writeFileSync(join(dir, 'settings.yaml'), 'extensions:\n  learn: off\n  grill: off\n');
  mkdirSync(join(dir, 'lessons', 'lesson-none'), { recursive: true });
  assert.equal(isActive('learn', dir), false);
  bridge('lessons', 'lesson-dead', { port: 1, token: 't', pid: 2 ** 22 + 1 });
  scan();
  assert.equal(isActive('learn', dir), false);
  bridge('lessons', 'lesson-a', { port: 1, token: 't', pid: process.pid });
  assert.equal(isActive('learn', dir), false, 'not before the next scan');
  scan();
  assert.equal(isActive('learn', dir), true);
  rmSync(join(dir, 'lessons', 'lesson-a', 'bridge.json'));
  scan();
  assert.equal(isActive('learn', dir), false);
  bridge('grills', 'g', { port: 1, token: 't', pid: process.pid });
  assert.equal(isActive('grill', dir), true);
});

test('owned fields may claim neither a core key nor another extension’s key', () => {
  const m = (id: string, key: string) => ({ id, fields: [{ key, after: 'source' }] });
  assert.deepEqual(ownedFields(ISSUE_FIELDS, [m('grill', 'x')]).map((f) => f.key), ['x']);
  assert.throws(() => ownedFields(ISSUE_FIELDS, [m('grill', 'title')]), /claims the core issue key 'title'/);
  assert.throws(() => ownedFields(ISSUE_FIELDS, [m('grill', 'x'), m('learn', 'x')]), /both claim the issue key 'x'/);
  assert.deepEqual(KNOWN_ISSUE_KEYS, [...ISSUE_FIELDS, 'grill', 'plan']);
});

const estimate: OwnedField = { key: 'estimate', after: 'source' };

test('owned fields become add/edit options, read back as values, and refuse to shadow an option', () => {
  const options = withFieldOptions({ title: { type: 'string' } }, [estimate]);
  assert.deepEqual(options, { title: { type: 'string' }, estimate: { type: 'string' } });
  assert.deepEqual(withFieldOptions({ title: { type: 'string' } }, []), { title: { type: 'string' } });
  assert.deepEqual(fieldValues({ title: 't', estimate: '3' }, [estimate]), [{ field: estimate, value: '3' }]);
  assert.deepEqual(fieldValues({ estimate: '' }, [estimate]), [{ field: estimate, value: '' }]);
  assert.deepEqual(fieldValues({ title: 't' }, [estimate]), []);
  assert.throws(() => withFieldOptions({ estimate: { type: 'boolean' } }, [estimate]), /owned field 'estimate' clashes with the option --estimate/);
});

test("show lines list an issue's owned fields that have a value", () => {
  assert.deepEqual(fieldLines({ extra: [{ key: 'estimate', value: 3, after: 'source' }] }, [estimate]), ['estimate:   3']);
  assert.deepEqual(fieldLines({ extra: [{ key: 'other', value: 3, after: 'source' }] }, [estimate]), []);
  assert.deepEqual(fieldLines({}, [estimate]), []);
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

test('the switch refuses off while a session of that kind is attached, and switches on regardless', async () => {
  const server = createServer((_, res) => res.end()).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  try {
    bridge('grills', 'g', { port: (server.address() as AddressInfo).port, token: 't', pid: process.pid });
    await assert.rejects(switchExtension(new Ctx(dir), 'grill', false), /a grill session is attached \(g\): switch grill off once it detaches/);
    assert.equal(existsSync(join(dir, 'settings.yaml')), false);
    assert.equal(await switchExtension(new Ctx(dir), 'grill', true), true);
    assert.equal(await switchExtension(new Ctx(dir), 'learn', false), true);
    assert.equal(settings(), 'extensions:\n  grill: on\n  learn: off\n');
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

test("grill's paths are gated: its pages, its mock files, Unfiled and its project section", () => {
  for (const p of ['/s/x', '/legacy/sessions/x/preview.html', '/api/s/x/files/preview.spec.js', '/p/unfiled', '/p/unfiled/grills', '/p/BEL/grills']) {
    assert.equal(ownerOfPath(p, ['grill']), 'grill', p);
  }
  for (const p of ['/', '/p', '/p/BEL', '/p/BEL/activity', '/api/s/x/chat', '/api/s/x/send', '/api/s/x/images', '/sessions']) {
    assert.equal(ownerOfPath(p, ['grill']), undefined, p);
  }
});

test("learn's paths are gated, segment by segment", () => {
  for (const p of ['/learn', '/learn/c/work', '/api/lesson/start', '/api/work', '/api/work/run', '/api/courses/c/claim']) {
    assert.equal(ownerOfPath(p, ['learn']), 'learn', p);
  }
  for (const p of ['/', '/learning', '/api/search', '/p/BEL', '/api/worker']) assert.equal(ownerOfPath(p, ['learn']), undefined, p);
});
