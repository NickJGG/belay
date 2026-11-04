import { execFileSync, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { after } from 'node:test';
import { fileURLToPath } from 'node:url';

const SCRIPTS = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'plugin', 'scripts');

export function run(script, { input = '', args = [], cwd } = {}) {
  const res = spawnSync(process.execPath, [join(SCRIPTS, script), ...args], { input, encoding: 'utf8', cwd });
  let json = null;
  try {
    json = JSON.parse(res.stdout);
  } catch {}
  return { code: res.status, stdout: res.stdout, stderr: res.stderr, json };
}

export function runJson(script, value, args = []) {
  const res = run(script, { input: typeof value === 'string' ? value : JSON.stringify(value), args });
  if (res.code !== 0) throw new Error(`${script} exited ${res.code}: ${res.stderr}`);
  return res.json;
}

export function tempDir() {
  const dir = mkdtempSync(join(tmpdir(), 'review-'));
  after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

export function writeFiles(root, files) {
  for (const [path, content] of Object.entries(files)) {
    mkdirSync(dirname(join(root, path)), { recursive: true });
    writeFileSync(join(root, path), content);
  }
}

export function git(cwd, ...args) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}

// A git repo with the given files committed on `branch`.
export function gitRepo(files, branch = 'main') {
  const dir = tempDir();
  git(dir, 'init', '-q', '-b', branch);
  git(dir, 'config', 'user.email', 't@example.com');
  git(dir, 'config', 'user.name', 'Test');
  git(dir, 'config', 'core.autocrlf', 'false');
  writeFiles(dir, files);
  git(dir, 'add', '-A');
  git(dir, 'commit', '-q', '-m', 'init');
  return dir;
}
