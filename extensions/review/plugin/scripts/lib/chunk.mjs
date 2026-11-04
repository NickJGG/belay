// Chunking by rendered size, keeping related files together. Rendered bytes are what a reviewer
// actually holds in context on every turn, so they are the measure; file count is not.
import { posix } from 'node:path';
import { seededShuffle } from './seed.mjs';

export const CHUNK_BYTES = 130000;
export const PART_BYTES = 60000;

const SPECIFIER = /(?:\bfrom\s*|\bimport\s*\(?\s*|\brequire\(\s*)['"](\.{1,2}\/[^'"]+)['"]/g;
const EXTENSIONS = /\.(?:[cm]?[jt]sx?)$/;

function stem(path) {
  return path.replace(EXTENSIONS, '').replace(/\/index$/, '');
}

// Relative imports only: they are what links files inside one change, and they need no resolver.
export function relativeImports(path, text) {
  const out = new Set();
  for (const m of text.matchAll(SPECIFIER)) out.add(stem(posix.normalize(posix.join(posix.dirname(path), m[1]))));
  return [...out];
}

// Each cluster is a list of units; related units join while the cluster stays under the limit.
// units: [{path, bytes, imports?}], imports being stems from relativeImports.
export function cluster(units, maxBytes = CHUNK_BYTES) {
  const clusters = units.map((u) => [u]);
  const owner = new Map(units.map((u, i) => [u, i]));
  const sizeOf = (i) => clusters[i].reduce((n, u) => n + u.bytes, 0);
  const join = (a, b) => {
    if (a === b || sizeOf(a) + sizeOf(b) > maxBytes) return;
    for (const u of clusters[b]) owner.set(u, a);
    clusters[a].push(...clusters[b]);
    clusters[b] = [];
  };
  const byStem = new Map();
  for (const u of units) {
    const key = stem(u.path);
    if (!byStem.has(key)) byStem.set(key, []);
    byStem.get(key).push(u);
  }
  for (const u of units) {
    for (const target of u.imports ?? []) {
      for (const v of byStem.get(target) ?? []) join(owner.get(u), owner.get(v));
    }
  }
  const byDir = new Map();
  for (const u of units) {
    const dir = posix.dirname(u.path);
    if (byDir.has(dir)) join(owner.get(byDir.get(dir)), owner.get(u));
    else byDir.set(dir, u);
  }
  return clusters.filter((c) => c.length);
}

// First-fit, so a shuffled order yields different boundaries without leaving chunks half-empty.
export function pack(clusters, maxBytes = CHUNK_BYTES) {
  const chunks = [];
  for (const c of clusters) {
    const size = c.reduce((n, u) => n + u.bytes, 0);
    const home = chunks.find((chunk) => chunk.bytes + size <= maxBytes);
    if (home) {
      home.units.push(...c);
      home.bytes += size;
    } else {
      chunks.push({ units: [...c], bytes: size });
    }
  }
  return chunks;
}

export function chunksInPathOrder(units, maxBytes = CHUNK_BYTES) {
  const sorted = [...units].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  return pack(cluster(sorted, maxBytes).sort((a, b) => (a[0].path < b[0].path ? -1 : 1)), maxBytes);
}

export function chunksForPass(units, seed, id, pass, maxBytes = CHUNK_BYTES) {
  const sorted = [...units].sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0));
  const clusters = cluster(sorted, maxBytes).map((c) => seededShuffle(c, seed, id, pass, c[0].path));
  return pack(seededShuffle(clusters, seed, id, pass), maxBytes);
}

// A chunk becomes files small enough to read in one call, so a reviewer can take them all in its
// first turn instead of paging through one big file and re-reading it on every turn since.
export function parts(texts, maxBytes = PART_BYTES) {
  const out = [];
  let current = '';
  for (const text of texts) {
    if (current && Buffer.byteLength(current) + Buffer.byteLength(text) > maxBytes) {
      out.push(current);
      current = '';
    }
    current += text;
  }
  if (current) out.push(current);
  return out;
}
