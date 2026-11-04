// Repo helpers shared by discover and modules: git, PATH lookup and workspace discovery.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { delimiter, join, resolve } from 'node:path';
import { globToRegex } from './files.mjs';

export function git(cwd, ...gitArgs) {
  try {
    return execFileSync('git', gitArgs, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 256 * 1024 * 1024 });
  } catch {
    return null;
  }
}

export function repoRoot(dir) {
  const top = git(dir, 'rev-parse', '--show-toplevel');
  return top ? resolve(top.trim()) : null;
}

// -z keeps non-ASCII paths unquoted.
export function trackedFiles(root, ...extra) {
  const out = git(root, 'ls-files', '-z', ...extra);
  return out ? out.split('\0').filter(Boolean) : [];
}

export function toPosix(path) {
  return path.replace(/\\/g, '/');
}

export function which(cmd) {
  const exts = process.platform === 'win32' ? (process.env.PATHEXT ?? '.EXE;.CMD;.BAT').split(';') : [''];
  for (const dir of (process.env.PATH ?? '').split(delimiter)) {
    if (!dir) continue;
    for (const ext of ['', ...exts]) {
      const candidate = join(dir, cmd + ext);
      try {
        if (statSync(candidate).isFile()) return true;
      } catch {}
    }
  }
  return false;
}

export function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

// The `packages:` list of pnpm-workspace.yaml, read line by line (no yaml dependency).
export function pnpmWorkspacePatterns(text) {
  const patterns = [];
  let inPackages = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '');
    if (/^packages\s*:/.test(line)) {
      inPackages = true;
      const inline = /\[(.*)\]/.exec(line);
      if (inline) {
        patterns.push(...inline[1].split(',').map(unquote).filter(Boolean));
        inPackages = false;
      }
      continue;
    }
    if (!inPackages) continue;
    const item = /^\s+-\s*(.+?)\s*$/.exec(line);
    if (item) patterns.push(unquote(item[1]));
    else if (/^\S/.test(line)) inPackages = false;
  }
  return patterns;
}

function unquote(value) {
  return value.trim().replace(/^(['"])(.*)\1$/, '$2');
}

const SKIP_DIRS = new Set(['node_modules', '.git', 'dist', 'build']);

function listDirs(root, rel, depth) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(join(root, rel), { withFileTypes: true });
  } catch {
    return out;
  }
  for (const e of entries) {
    if (!e.isDirectory() || SKIP_DIRS.has(e.name) || e.name.startsWith('.')) continue;
    const child = rel ? `${rel}/${e.name}` : e.name;
    out.push(child);
    if (depth > 1) out.push(...listDirs(root, child, depth - 1));
  }
  return out;
}

// Directories (relative, posix) matching the workspace globs that hold a package.json.
export function expandWorkspaceGlobs(root, patterns) {
  const include = patterns.filter((p) => !p.startsWith('!')).map((p) => p.replace(/^\.\//, '').replace(/\/+$/, ''));
  const exclude = patterns.filter((p) => p.startsWith('!')).map((p) => globToRegex(p.slice(1).replace(/^\.\//, '').replace(/\/+$/, '')));
  const found = new Set();
  for (const pattern of include) {
    if (!/[*?]/.test(pattern)) {
      if (existsSync(join(root, pattern, 'package.json'))) found.add(pattern);
      continue;
    }
    const depth = pattern.includes('**') ? 6 : pattern.split('/').length;
    const rx = globToRegex(pattern);
    for (const dir of listDirs(root, '', depth)) {
      if (rx.test(dir) && existsSync(join(root, dir, 'package.json'))) found.add(dir);
    }
  }
  return [...found].filter((d) => !exclude.some((rx) => rx.test(d))).sort();
}

// The root (".") when it has a package.json, plus every workspace package dir.
export function jsWorkspaceDirs(root) {
  const pkg = readJson(join(root, 'package.json'));
  if (!pkg) return [];
  const patterns = [];
  if (Array.isArray(pkg.workspaces)) patterns.push(...pkg.workspaces);
  else if (Array.isArray(pkg.workspaces?.packages)) patterns.push(...pkg.workspaces.packages);
  const pnpmFile = join(root, 'pnpm-workspace.yaml');
  if (existsSync(pnpmFile)) patterns.push(...pnpmWorkspacePatterns(readFileSync(pnpmFile, 'utf8')));
  return ['.', ...expandWorkspaceGlobs(root, patterns).filter((d) => d !== '.')];
}
