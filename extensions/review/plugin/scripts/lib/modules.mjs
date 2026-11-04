// A repo or folder as it is now, split into modules: workspace packages, else top-level folders,
// plus "(root)". Shared by snapshot reviews and campaigns.
import { closeSync, openSync, readSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { classesFor, hasBinaryExtension, inScope, matchPrefix, noiseMatch, secretPattern } from './files.mjs';
import { jsWorkspaceDirs, trackedFiles } from './repo.mjs';

const ROOT_MODULE = '(root)';

// Same test git uses: a NUL byte in the first 8000 bytes means binary.
function looksBinary(path) {
  const buf = Buffer.alloc(8000);
  const fd = openSync(path, 'r');
  try {
    return buf.subarray(0, readSync(fd, buf, 0, buf.length, 0)).includes(0);
  } finally {
    closeSync(fd);
  }
}

function moduleDir(path, workspaceDirs) {
  const ws = workspaceDirs.find((d) => path.startsWith(`${d}/`));
  if (ws) return ws;
  const slash = path.indexOf('/');
  return slash === -1 ? '.' : path.slice(0, slash);
}

export function listModules(root, { paths = [], exclude = [] } = {}) {
  // Deepest first, so a nested package wins over its parent.
  const workspaceDirs = jsWorkspaceDirs(root).filter((d) => d !== '.').sort((a, b) => b.length - a.length);
  const excluded = [];
  const modules = new Map();
  for (const path of trackedFiles(root)) {
    if (!inScope(paths, path)) continue;
    let reason = null;
    if (secretPattern(path)) reason = 'secret';
    else if (matchPrefix(exclude, path) !== null) reason = 'user_rule';
    else reason = noiseMatch(path)?.reason ?? (hasBinaryExtension(path) ? 'binary' : null);
    if (reason) { excluded.push({ path, reason }); continue; }

    const full = join(root, path);
    let stat;
    try {
      stat = statSync(full);
    } catch {
      continue; // tracked but deleted in the working tree
    }
    if (!stat.isFile()) continue; // a submodule
    const bytes = stat.size;
    if (looksBinary(full)) { excluded.push({ path, reason: 'binary' }); continue; }

    const dir = moduleDir(path, workspaceDirs);
    if (!modules.has(dir)) modules.set(dir, { name: dir === '.' ? ROOT_MODULE : dir, dir, files: [], bytes: 0 });
    const mod = modules.get(dir);
    mod.files.push({ path, status: 'A', bytes, classes: classesFor(path, 'A') });
    mod.bytes += bytes;
  }
  const sorted = [...modules.values()].sort((a, b) => (a.dir === '.' ? -1 : b.dir === '.' ? 1 : a.dir.localeCompare(b.dir)));
  return { modules: sorted, excluded };
}
