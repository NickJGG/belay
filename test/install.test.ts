import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { afterEach, beforeEach, test } from 'node:test';
import { installedIds } from '../src/extension-ids.ts';
import { generate } from '../src/generate.ts';
import { installExtension, pnpmArgs, setInstalled, uninstallExtension, type InstallSteps } from '../src/install.ts';

let tmp: string;
let root: string;
let data: string;

const put = (rel: string, text: string) => {
  const file = join(root, rel);
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};

const belayJson = (id: string) =>
  JSON.stringify({ id, name: id, summary: `${id} things`, mark: { path: 'M0 0', dot: { x: 1, y: 2, r: 3 } }, paths: [`/${id}`], sessions: `${id}s` });

/** A bundled extension with a page, a package and a plugin, each optional. */
function extension(id: string, { pkg = true, plugin = true } = {}) {
  put(`extensions/${id}/belay.json`, belayJson(id));
  put(`extensions/${id}/web/${id}/page.tsx`, 'export default function Page() { return null; }\n');
  if (pkg) put(`extensions/${id}/package.json`, `{ "name": "belay-extension-${id}" }\n`);
  if (plugin) put(`extensions/${id}/plugin/.claude-plugin/plugin.json`, `{ "name": "${id}" }\n`);
}

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), 'belay-install-'));
  root = join(tmp, 'clone');
  data = join(tmp, 'data');
  mkdirSync(join(data, 'issues'), { recursive: true });
  writeFileSync(join(data, 'settings.yaml'), 'extensions:\n  demo: off\n');
  extension('demo');
  extension('other', { pkg: false, plugin: false });
});

afterEach(() => rmSync(tmp, { recursive: true, force: true }));

interface Call {
  step: string;
  args: readonly string[];
  /** The record when the call ran. */
  installed: string[];
}

/** Steps that record their calls; `claude plugin list` prints `plugins`; `fail` names a step to throw in. */
function fakeSteps(plugins: object[] = [], fail?: string) {
  const calls: Call[] = [];
  const note = (step: string, args: readonly string[]) => {
    calls.push({ step, args, installed: installedIds(root) });
    if (step === fail) throw new Error(`${step} broke`);
  };
  const steps: InstallSteps = {
    pnpm: async (_root, args) => note('pnpm', args),
    generate: (r, ids) => {
      note('generate', ids);
      generate(r, ids);
    },
    claude: async (args) => {
      note('claude', args);
      return args[1] === 'list' ? JSON.stringify(plugins) : '';
    },
  };
  return { steps, calls };
}

const opts = (steps: InstallSteps) => ({ root, data, steps });
const stub = (id: string) => join(root, 'web', 'src', 'app', '(browse)', `(${id})`, id, 'page.tsx');

/** Every file under `dir` with its contents and mtime. */
function snapshot(dir: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const e of readdirSync(dir, { withFileTypes: true, recursive: true })) {
    if (!e.isFile()) continue;
    const p = join(e.parentPath, e.name);
    out[p] = `${statSync(p).mtimeMs}:${readFileSync(p, 'utf8')}`;
  }
  return out;
}

test('install runs dependencies, generated files and the plugin, and writes the record last', async () => {
  const before = snapshot(data);
  const { steps, calls } = fakeSteps([{ id: 'belay@belay', version: '1.0.0', folderVersion: '1.0.0' }]);
  const seen: string[] = [];
  assert.equal(await installExtension('demo', { ...opts(steps), onStep: (s, n, of) => seen.push(`${s} ${n}/${of}`) }), true);
  assert.deepEqual(seen, ['dependencies 1/4', 'generated files 2/4', 'Claude Code plugin 3/4', 'record 4/4']);
  assert.deepEqual(
    calls.map((c) => [c.step, c.args.join(' '), c.installed.join()]),
    [
      ['pnpm', 'install --filter . --filter ./web --filter ./extensions/demo', ''],
      ['generate', 'demo', ''],
      ['claude', 'plugin list --json', ''],
      ['claude', 'plugin install demo@belay', ''],
    ],
  );
  assert.deepEqual(installedIds(root), ['demo']);
  assert.deepEqual(JSON.parse(readFileSync(join(root, 'extensions', 'installed.json'), 'utf8')), { installed: ['demo'] });
  assert.ok(existsSync(stub('demo')));
  assert.deepEqual(snapshot(data), before);
});

test('installing again runs the steps but skips an installed plugin; the core plugin is updated when its folder is newer', async () => {
  const { steps } = fakeSteps();
  await installExtension('demo', opts(steps));
  const again = fakeSteps([{ id: 'demo@belay' }, { id: 'belay@belay', version: '1.0.0', folderVersion: '1.1.0' }]);
  assert.equal(await installExtension('demo', opts(again.steps)), false);
  assert.deepEqual(
    again.calls.filter((c) => c.step === 'claude').map((c) => c.args.join(' ')),
    ['plugin list --json', 'plugin update belay@belay'],
  );
});

test("an extension without a package or a plugin gets no filter and no claude call; installed ones stay in the filter", async () => {
  await installExtension('demo', opts(fakeSteps().steps));
  const { steps, calls } = fakeSteps();
  await installExtension('other', opts(steps));
  assert.deepEqual(
    calls.map((c) => [c.step, c.args.join(' ')]),
    [
      ['pnpm', 'install --filter . --filter ./web --filter ./extensions/demo'],
      ['generate', 'demo other'],
    ],
  );
  assert.deepEqual(installedIds(root), ['demo', 'other']);
  assert.deepEqual(pnpmArgs(root, ['other']), ['install', '--filter', '.', '--filter', './web']);
});

test('a failed step stops the install before the record and names the step; a rerun finishes it', async () => {
  for (const fail of ['pnpm', 'generate', 'claude']) {
    const { steps } = fakeSteps([], fail);
    const step = { pnpm: 'dependencies', generate: 'generated files', claude: 'Claude Code plugin' }[fail];
    await assert.rejects(installExtension('demo', opts(steps)), new RegExp(`^Error: ${step}: ${fail} broke$`));
    assert.deepEqual(installedIds(root), []);
  }
  assert.equal(await installExtension('demo', opts(fakeSteps().steps)), true);
  assert.deepEqual(installedIds(root), ['demo']);
});

test('install and uninstall refuse an id that is not a bundled extension', async () => {
  for (const id of ['nope', '../demo', 'Demo', '']) {
    const { steps, calls } = fakeSteps();
    await assert.rejects(installExtension(id, opts(steps)), /^Error: no extension '.*' \(bundled: demo, other\)$/);
    await assert.rejects(uninstallExtension(id, opts(steps)), /^Error: no extension/);
    assert.deepEqual(calls, []);
  }
});

test('uninstall drops the record first, then the plugin, stubs and dev route types, then dependencies; data stays', async () => {
  await installExtension('demo', opts(fakeSteps().steps));
  await installExtension('other', opts(fakeSteps().steps));
  put('web/src/app/(browse)/(demo)/mine.ts', 'export const x = 1;\n');
  put('web/.next/dev/types/routes.d.ts', '');
  writeFileSync(join(data, 'settings.yaml'), 'extensions:\n  demo: on\n');
  mkdirSync(join(data, 'demos', 'a-session'), { recursive: true });
  writeFileSync(join(data, 'demos', 'a-session', 'session.json'), '{}');
  const before = snapshot(data);

  const { steps, calls } = fakeSteps([{ id: 'demo@belay' }]);
  assert.equal(await uninstallExtension('demo', opts(steps)), true);
  assert.deepEqual(
    calls.map((c) => [c.step, c.args.join(' '), c.installed.join()]),
    [
      ['claude', 'plugin list --json', 'other'],
      ['claude', 'plugin uninstall demo@belay --keep-data', 'other'],
      ['generate', 'other', 'other'],
      ['pnpm', 'install --filter . --filter ./web', 'other'],
    ],
  );
  assert.equal(existsSync(stub('demo')), false);
  assert.equal(existsSync(join(root, 'web', '.next', 'dev', 'types')), false);
  // Not generated, so the stub cleanup leaves it.
  assert.equal(readFileSync(join(root, 'web', 'src', 'app', '(browse)', '(demo)', 'mine.ts'), 'utf8'), 'export const x = 1;\n');
  assert.ok(existsSync(join(root, 'extensions', 'demo', 'web', 'demo', 'page.tsx')));
  assert.deepEqual(snapshot(data), before);

  const again = fakeSteps([]);
  assert.equal(await uninstallExtension('demo', opts(again.steps)), false);
  assert.deepEqual(
    again.calls.filter((c) => c.step === 'claude').map((c) => c.args.join(' ')),
    ['plugin list --json'],
  );
});

test('a failed uninstall step leaves it uninstalled and names the step; a rerun finishes it', async () => {
  await installExtension('demo', opts(fakeSteps().steps));
  await assert.rejects(uninstallExtension('demo', opts(fakeSteps([{ id: 'demo@belay' }], 'generate').steps)), /^Error: generated files: generate broke$/);
  assert.deepEqual(installedIds(root), []);
  assert.ok(existsSync(stub('demo')));
  assert.equal(await uninstallExtension('demo', opts(fakeSteps().steps)), false);
  assert.equal(existsSync(stub('demo')), false);
});

test('uninstall is refused, changing nothing, while one of its sessions is attached', async () => {
  await installExtension('demo', opts(fakeSteps().steps));
  const server = createServer((_, res) => res.end()).listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  try {
    const { port } = server.address() as AddressInfo;
    mkdirSync(join(data, 'demos', 'live'), { recursive: true });
    writeFileSync(join(data, 'demos', 'live', 'bridge.json'), JSON.stringify({ port, token: 't', pid: process.pid }));
    const { steps, calls } = fakeSteps();
    await assert.rejects(uninstallExtension('demo', opts(steps)), /^Error: a demo session is attached \(live\): uninstall demo once it detaches$/);
    assert.deepEqual(calls, []);
    assert.deepEqual(installedIds(root), ['demo']);
    assert.ok(existsSync(stub('demo')));
  } finally {
    server.close();
  }
});

test('the record keeps ids it does not bundle, sorted, and a no-op leaves the file alone', () => {
  writeFileSync(join(root, 'extensions', 'installed.json'), '{"installed":["zed"]}');
  assert.equal(setInstalled(root, 'demo', true), true);
  assert.equal(readFileSync(join(root, 'extensions', 'installed.json'), 'utf8'), '{\n  "installed": [\n    "demo",\n    "zed"\n  ]\n}\n');
  const stamp = statSync(join(root, 'extensions', 'installed.json')).mtimeMs;
  assert.equal(setInstalled(root, 'demo', true), false);
  assert.equal(setInstalled(root, 'other', false), false);
  assert.equal(statSync(join(root, 'extensions', 'installed.json')).mtimeMs, stamp);
});
