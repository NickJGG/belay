// File rules shared by select-files, select-agents and modules: glob matching,
// secret and noise detection, and the class tags that decide which reviewers run.
import { readFileSync } from 'node:fs';

const RULES = JSON.parse(readFileSync(new URL('../file-classes.json', import.meta.url), 'utf8'));

export const DEFAULT_MAX_FILE_DIFF_BYTES = 160000;

// Expands every {a,b} group into the cross product of its variants.
export function expandBraces(pattern) {
  const m = /\{([^{}]*)\}/.exec(pattern);
  if (!m) return [pattern];
  const prefix = pattern.slice(0, m.index);
  const suffix = pattern.slice(m.index + m[0].length);
  return m[1].split(',').flatMap((opt) => expandBraces(prefix + opt + suffix));
}

// `**/` and `**` cross directories; `*` and `?` do not.
export function globToRegex(pattern) {
  let out = '';
  for (let i = 0; i < pattern.length; ) {
    if (pattern.startsWith('**/', i)) { out += '(?:.*/)?'; i += 3; }
    else if (pattern.startsWith('**', i)) { out += '.*'; i += 2; }
    else if (pattern[i] === '*') { out += '[^/]*'; i += 1; }
    else if (pattern[i] === '?') { out += '[^/]'; i += 1; }
    else { out += pattern[i].replace(/[.+^${}()|[\]\\]/g, '\\$&'); i += 1; }
  }
  return new RegExp(`^${out}$`);
}

// Case-insensitive: PascalCase names (AuthService.java, LoginForm.tsx) must still match.
export function compileGlob(pattern) {
  return expandBraces(pattern.toLowerCase()).map(globToRegex);
}

function compileList(patterns) {
  return patterns.map((pattern) => ({ pattern, rx: compileGlob(pattern) }));
}

function matches(rx, path) {
  const lowered = path.toLowerCase();
  return rx.some((r) => r.test(lowered));
}

function firstMatch(rules, path) {
  return rules.find((r) => matches(r.rx, path))?.pattern ?? null;
}

const secretRules = compileList(RULES.secret);
const notSecretRules = compileList(RULES.notSecret);
const excludeRules = Object.entries(RULES.exclude).map(([reason, patterns]) => ({ reason, rules: compileList(patterns) }));
const classRules = Object.entries(RULES.classes).map(([pattern, tags]) => ({ pattern, rx: compileGlob(pattern), tags }));
const contentRules = Object.entries(RULES.content_signals).map(([cls, patterns]) => ({ cls, rx: patterns.map((p) => new RegExp(p)) }));
const binaryExtensions = new Set(RULES.binaryExtensions);

export function normalizePath(path) {
  return path.replace(/\\/g, '/').replace(/^\.\//, '');
}

export function secretPattern(path) {
  if (firstMatch(notSecretRules, path)) return null;
  return firstMatch(secretRules, path);
}

// Returns {reason, pattern} for lockfile, vendored or generated noise, else null.
export function noiseMatch(path) {
  for (const { reason, rules } of excludeRules) {
    const pattern = firstMatch(rules, path);
    if (pattern) return { reason, pattern };
  }
  return null;
}

export function hasBinaryExtension(path) {
  const dot = path.lastIndexOf('.');
  return dot > path.lastIndexOf('/') && binaryExtensions.has(path.slice(dot + 1).toLowerCase());
}

export function extOf(path) {
  const base = path.slice(path.lastIndexOf('/') + 1);
  const dot = base.lastIndexOf('.');
  return dot > 0 ? base.slice(dot + 1) : '';
}

// Content regexes stay case-sensitive: they match code identifiers like innerHTML.
export function classesFor(path, status, diff) {
  const classes = new Set();
  for (const r of classRules) if (matches(r.rx, path)) r.tags.forEach((t) => classes.add(t));
  if (diff) for (const r of contentRules) if (r.rx.some((rx) => rx.test(diff))) classes.add(r.cls);
  // Removing a module is an API change even with no new content to scan.
  if (status === 'D' && classes.has('code')) classes.add('contract');
  return [...classes].sort();
}

export function splitCsv(value) {
  return value ? value.split(',').map((v) => normalizePath(v.trim())).filter(Boolean) : [];
}

export function matchPrefix(prefixes, path) {
  return prefixes.find((p) => path.startsWith(p)) ?? null;
}

export function inScope(paths, path) {
  return paths.length === 0 || matchPrefix(paths, path) !== null;
}

export function explain(path) {
  return {
    path,
    secret: secretPattern(path),
    noise: noiseMatch(path),
    binaryExtension: hasBinaryExtension(path),
    classes: classesFor(path),
    content_signals: 'not evaluated (path-only mode)',
  };
}
