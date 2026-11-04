#!/usr/bin/env node
// deps: what a manifest change did to the dependencies.
//
// --before/--after: two package.json texts, or two requirements.txt texts (name==version lines).
// An empty file stands for a manifest that didn't exist on that side.
// stdout: {added:[{name, section, version}], removed:[{name, section, version}],
//          majorBumps:[{name, section, from, to}], otherBumps:[{name, section, from, to}]}
// A version range is compared by its major (0.x ranges by major.minor, which is what caret
// treats as breaking); a change with either side unparseable (tags, URLs, `*`) is an otherBump.
import { readFileSync } from 'node:fs';
import { args, emit, fail } from './lib/cli.mjs';

const NAME = 'deps';
const SECTIONS = ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies'];

function parsePackageJson(text) {
  const pkg = JSON.parse(text);
  if (!pkg || typeof pkg !== 'object' || Array.isArray(pkg)) throw new Error('not a package.json object');
  const deps = new Map();
  for (const section of SECTIONS) {
    for (const [name, version] of Object.entries(pkg[section] ?? {})) deps.set(`${section}\0${name}`, { name, section, version: String(version) });
  }
  return deps;
}

function parseRequirements(text) {
  const deps = new Map();
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#') || line.startsWith('-')) continue;
    const m = /^([A-Za-z0-9][A-Za-z0-9._-]*)(?:\[[^\]]*\])?\s*(.*)$/.exec(line);
    if (!m) continue;
    const name = m[1].toLowerCase().replace(/[._]+/g, '-');
    deps.set(`requirements\0${name}`, { name, section: 'requirements', version: m[2].split(';')[0].trim() });
  }
  return deps;
}

function parseManifest(text) {
  if (!text.trim()) return { kind: null, deps: new Map() };
  if (text.trim().startsWith('{')) return { kind: 'package.json', deps: parsePackageJson(text) };
  return { kind: 'requirements', deps: parseRequirements(text) };
}

// "^1.2.3" → "1", "~0.4" → "0.4", "1.x" → "1", "npm:foo@^2" → "2"; null when not semver-ish.
function majorOf(range) {
  let v = range.trim();
  if (v.startsWith('npm:')) v = v.slice(v.lastIndexOf('@') + 1);
  v = v.replace(/^workspace:/, '').replace(/^([<>=!~^]+)\s+/, '$1').split(/\s+|\|\|/)[0];
  v = v.replace(/^(?:~=|[\^~]|[<>]=?|={1,3}|!=)/, '').replace(/^v/, '');
  const m = /^(\d+)(?:\.(\d+|x|\*))?/i.exec(v);
  if (!m) return null;
  if (m[1] === '0' && m[2] && /^\d+$/.test(m[2])) return `0.${m[2]}`;
  return m[1];
}

function compare(before, after) {
  const out = { added: [], removed: [], majorBumps: [], otherBumps: [] };
  for (const [key, dep] of after) if (!before.has(key)) out.added.push(dep);
  for (const [key, dep] of before) if (!after.has(key)) out.removed.push(dep);
  for (const [key, dep] of after) {
    const old = before.get(key);
    if (!old || old.version === dep.version) continue;
    const bump = { name: dep.name, section: dep.section, from: old.version, to: dep.version };
    const a = majorOf(old.version);
    const b = majorOf(dep.version);
    (a !== null && b !== null && a !== b ? out.majorBumps : out.otherBumps).push(bump);
  }
  return out;
}

function load(path) {
  try {
    return readFileSync(path, 'utf8');
  } catch (err) {
    fail(NAME, `cannot read ${path}: ${err.message}`);
  }
}

function main() {
  const { values } = args(NAME, { before: { type: 'string' }, after: { type: 'string' } });
  if (values.before === undefined || values.after === undefined) fail(NAME, 'usage: deps.mjs --before <file> --after <file>');
  let before, after;
  try {
    before = parseManifest(load(values.before));
    after = parseManifest(load(values.after));
  } catch (err) {
    fail(NAME, `malformed manifest: ${err.message}`);
  }
  if (before.kind && after.kind && before.kind !== after.kind) fail(NAME, `manifest kinds differ: ${before.kind} vs ${after.kind}`);
  emit(compare(before.deps, after.deps));
}

main();
