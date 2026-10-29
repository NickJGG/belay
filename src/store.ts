/**
 * File format for the data dir: `projects/<key>.md` and `issues/<key>-<n>.md`, each a YAML
 * frontmatter block followed by a free-form markdown body. Everything that writes goes
 * through here so the format rules (field order, validation, ID allocation) live in one place.
 *
 * Keys and IDs are uppercase in memory and in frontmatter (`ELV`, `ELV-12`) and lowercase in
 * file names. Loading uppercases whatever it reads, so files from before that rule still load.
 *
 * An issue keeps frontmatter keys it doesn't know (`Issue.extra`) when their values are plain; a file with any
 * other unknown value is bad, so no op writes it. Projects, logs and `order.yaml` drop unknown keys on save.
 */
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, statSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { isDeepStrictEqual } from 'node:util';
import { YAMLError, isAlias, isMap, isPair, isScalar, isSeq, parse, parseDocument, stringify, type Document } from 'yaml';
import { ownedFields, type OwnedField } from './extensions.ts';

export const ISSUE_STATUSES = ['idea', 'todo', 'doing', 'done', 'dropped'] as const;
export const PROJECT_STATUSES = ['active', 'paused', 'archived'] as const;
export const SOURCES = ['user', 'claude'] as const;

export type IssueStatus = (typeof ISSUE_STATUSES)[number];
type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type Source = (typeof SOURCES)[number];

export interface Project {
  key: string;
  name: string;
  paths: string[];
  status: ProjectStatus;
  focus: boolean;
  group?: string;
  /** Image path, absolute or relative to the first of `paths`. */
  icon?: string;
  /** The app's colour for it, `#rgb` or `#rrggbb`; without one the app derives a hue from the key. */
  color?: string;
  /** Log-entry kinds the project declares; absent when none. */
  kinds?: string[];
  body: string;
}

export interface Comment {
  /** Local time to the minute, `YYYY-MM-DDTHH:MM`. */
  at: string;
  by: Source;
  /** The Claude Code session it came from; only when `by` is `claude`. */
  session?: string;
  text: string;
}

export interface Issue {
  id: string;
  title: string;
  project: string;
  status: IssueStatus;
  blocked_by: string[];
  priority?: 'high';
  source: Source;
  created: string;
  updated: string;
  /** Oldest first. */
  comments: Comment[];
  /** Oldest first; absent on issues from before transitions were recorded. */
  transitions?: Transition[];
  /** Extensions' owned fields and the frontmatter keys the store doesn't know, in file order; absent when there are none. */
  extra?: ExtraKey[];
  body: string;
}

/**
 * `after` is the nearest known key before it in the file, `null` when none is: it's written back after that key. An
 * owned field's `after` is its slot's, and it's always written in that slot.
 */
export interface ExtraKey {
  key: string | number;
  value: unknown;
  after: string | null;
}

/** The core keys `serializeIssue` writes, in the order it writes them. */
export const ISSUE_FIELDS = ['id', 'title', 'project', 'status', 'blocked_by', 'priority', 'source', 'created', 'updated', 'comments', 'transitions'] as const;

/** Every built-in extension's owned fields, on or off: they're kept and validated whether or not it's active. */
const OWNED: ReadonlyMap<string, OwnedField> = new Map(ownedFields(ISSUE_FIELDS).map((f) => [f.key, f]));

/** The core fields and the owned ones. The rest are unknown, though still kept. */
export const KNOWN_ISSUE_KEYS: readonly string[] = [...ISSUE_FIELDS, ...OWNED.keys()];

/** The order `serializeIssue` writes known keys in: each owned field after its `after`, behind any field already there. */
const ISSUE_ORDER: readonly string[] = [...OWNED.values()].reduce<string[]>((order, f) => {
  let i = order.indexOf(f.after);
  if (i < 0) throw new Error(`the owned issue field '${f.key}' goes after '${f.after}', which isn't a known key before it`);
  while (OWNED.has(order[i + 1])) i++;
  return order.toSpliced(i + 1, 0, f.key);
}, [...ISSUE_FIELDS]);

interface Transition {
  at: string;
  /** Absent on the creation record. */
  from?: IssueStatus;
  to: IssueStatus;
  by: Source;
  session?: string;
}

/** What a new key must be: 3–4 letters, like Linear's team keys and JIRA's project keys. */
/** A project colour as stored: `#rgb` or `#rrggbb`. */
export const COLOR_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

const KEY_RE = /^[A-Z]{3,4}$/;
/** Keys from before the 3–4 letter rule (`PZ-ELEVATORS`) still load and save, so `project rekey` can migrate them. */
const STORED_KEY_RE = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*$/;
const ID_RE = /^([a-z][a-z0-9-]*)-(\d+)$/i;

/** The stored form of a typed key or ID. */
export function canon(s: string): string {
  return s.trim().toUpperCase();
}

export function parseId(id: string): { key: string; n: number } | undefined {
  const m = ID_RE.exec(id);
  return m ? { key: m[1].toUpperCase(), n: Number(m[2]) } : undefined;
}

export function compareIds(a: string, b: string): number {
  const pa = parseId(a);
  const pb = parseId(b);
  if (!pa || !pb) return a.localeCompare(b);
  return pa.key.localeCompare(pb.key) || pa.n - pb.n;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function today(d = new Date()): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Local time to the minute, the form a comment's `at` takes. */
export function now(d = new Date()): string {
  return `${today(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** Forward slashes, no trailing slash: the form paths are stored in. */
export function normalizeStoredPath(p: string): string {
  return resolve(p).replaceAll('\\', '/').replace(/(?<=.)\/$/, '');
}

// --- frontmatter ---

type Data = Record<string, unknown>;

function yamlFailure(e: YAMLError, where: string, offset: number): Error {
  const line = e.linePos?.[0].line;
  const reason = e.message.replace(/ at line \d+, column \d+:[\s\S]*$/, '');
  return new Error(`${where}: ${line ? `line ${line + offset}: ` : ''}${reason}`);
}

/** yaml's `parse`, failing as `<where>: line N: <reason>`. `offset` is how many file lines precede `src`. */
export function parseYaml(src: string, where: string, offset = 0): unknown {
  try {
    return parse(src);
  } catch (e) {
    if (!(e instanceof YAMLError)) throw e;
    throw yamlFailure(e, where, offset);
  }
}

function frontmatterParts(text: string, where: string): { yaml: string; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n?---(?:\r?\n|$)([\s\S]*)$/.exec(text);
  if (!m) throw new Error(`${where}: missing frontmatter`);
  return { yaml: m[1], body: m[2].trim() };
}

function frontmatterData(data: unknown, where: string): Data {
  if (typeof data !== 'object' || Array.isArray(data)) throw new Error(`${where}: frontmatter is not a mapping`);
  return data as Data;
}

export function splitFrontmatter(text: string, where: string): { data: Data; body: string } {
  const { yaml, body } = frontmatterParts(text, where);
  return { data: frontmatterData(parseYaml(yaml, where, 1) ?? {}, where), body };
}

function joinFrontmatter(data: Data | Map<unknown, unknown>, body: string): string {
  const head = `---\n${stringify(data, { lineWidth: 0 })}---\n`;
  return body.trim() ? `${head}\n${body.trim()}\n` : head;
}

// --- validation ---

function text(d: Data, k: string, where: string): string {
  const v = d[k];
  if ((typeof v === 'string' && v.trim()) || typeof v === 'number') return String(v);
  throw new Error(`${where}: '${k}' must be a non-empty string`);
}

export function optText(d: Data, k: string, where: string): string | undefined {
  return d[k] == null ? undefined : text(d, k, where);
}

export function oneOf<T extends string>(d: Data, k: string, allowed: readonly T[], where: string, fallback?: T): T {
  const v = d[k] ?? fallback;
  if (allowed.includes(v as T)) return v as T;
  throw new Error(`${where}: '${k}' must be one of ${allowed.join('|')} (got ${JSON.stringify(d[k])})`);
}

function textList(d: Data, k: string, where: string): string[] {
  const v = d[k] ?? [];
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v;
  throw new Error(`${where}: '${k}' must be a list of strings`);
}

export function optPositiveInt(d: Data, k: string, where: string): number | undefined {
  const v = d[k];
  if (v == null) return undefined;
  if (Number.isInteger(v) && (v as number) > 0) return v as number;
  throw new Error(`${where}: '${k}' must be a positive integer (got ${JSON.stringify(v)})`);
}

export function isMapping(v: unknown): v is Data {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

export const AT_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
export const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

function transitionList(d: Data, where: string): Transition[] | undefined {
  const v = d.transitions;
  if (v == null) return undefined;
  if (!Array.isArray(v)) throw new Error(`${where}: 'transitions' must be a list`);
  return v.map((t, i) => {
    const loc = `${where} transition #${i + 1}`;
    if (!isMapping(t)) throw new Error(`${loc}: not a mapping`);
    if (typeof t.at !== 'string' || !AT_RE.test(t.at)) throw new Error(`${loc}: 'at' must be YYYY-MM-DDTHH:MM (got ${JSON.stringify(t.at)})`);
    const session = optText(t, 'session', loc);
    return {
      at: t.at,
      ...(t.from != null && { from: oneOf(t, 'from', ISSUE_STATUSES, loc) }),
      to: oneOf(t, 'to', ISSUE_STATUSES, loc),
      by: oneOf(t, 'by', SOURCES, loc),
      ...(session && { session }),
    };
  });
}

function commentList(d: Data, where: string): Comment[] {
  const v = d.comments ?? [];
  if (!Array.isArray(v)) throw new Error(`${where}: 'comments' must be a list`);
  return v.map((c, i) => {
    const loc = `${where} comment #${i + 1}`;
    if (!isMapping(c)) throw new Error(`${loc}: not a mapping`);
    if (typeof c.at !== 'string' || !AT_RE.test(c.at)) throw new Error(`${loc}: 'at' must be YYYY-MM-DDTHH:MM (got ${JSON.stringify(c.at)})`);
    if (typeof c.text !== 'string' || !c.text.trim()) throw new Error(`${loc}: 'text' must be a non-empty string`);
    const session = optText(c, 'session', loc);
    return { at: c.at, by: oneOf(c, 'by', SOURCES, loc), ...(session && { session }), text: c.text };
  });
}

export function validateKey(key: string): void {
  if (!KEY_RE.test(key)) throw new Error(`invalid project key '${key}' (3–4 letters)`);
}

function validateStoredKey(key: string, where: string): void {
  if (!STORED_KEY_RE.test(key)) throw new Error(`${where}: invalid project key '${key}'`);
}

// --- projects ---

export function parseProject(src: string, where: string): Project {
  const { data: d, body } = splitFrontmatter(src, where);
  const key = canon(text(d, 'key', where));
  validateStoredKey(key, where);
  if (typeof (d.focus ?? false) !== 'boolean') throw new Error(`${where}: 'focus' must be true or false`);
  const kinds = textList(d, 'kinds', where);
  return {
    key,
    name: text(d, 'name', where),
    paths: textList(d, 'paths', where),
    status: oneOf(d, 'status', PROJECT_STATUSES, where, 'active'),
    focus: (d.focus as boolean | undefined) ?? false,
    group: optText(d, 'group', where),
    ...(d.icon != null && { icon: text(d, 'icon', where) }),
    ...(d.color != null && { color: text(d, 'color', where) }),
    ...(kinds.length && { kinds }),
    body,
  };
}

export function serializeProject(p: Project): string {
  const { key, name, paths, status, focus, group, icon, color, kinds, body } = p;
  return joinFrontmatter({ key, name, paths, status, focus, group, icon, color, kinds: kinds?.length ? kinds : undefined }, body);
}

// --- issues ---

const PLAIN_TAGS = new Set(['str', 'int', 'float', 'bool', 'null', 'map', 'seq'].map((t) => `tag:yaml.org,2002:${t}`));

const nodeJS = (node: unknown, doc: Document, mapAsMap = false): unknown =>
  isScalar(node) || isMap(node) || isSeq(node) ? node.toJS(doc, { mapAsMap }) : null;

/**
 * Why a node isn't plain, or undefined when it is: plain values use only the core tags and no aliases, and parse back
 * from a save deep-equal to how `bigDoc` (`intAsBigInt`) read them, with key types kept, and survive JSON for the cache.
 */
function notPlain(node: unknown, big: unknown, doc: Document, bigDoc: Document): string | undefined {
  const shape = (n: unknown): string | undefined => {
    if (isAlias(n)) return 'is an alias';
    const tag = (n as { tag?: string } | null)?.tag;
    if (tag && !PLAIN_TAGS.has(tag)) return `has the tag ${tag.replace('tag:yaml.org,2002:', '!!')}`;
    if (!isMap(n) && !isSeq(n)) return undefined;
    for (const item of n.items as unknown[]) {
      const why = isPair(item) ? (shape(item.key) ?? shape(item.value)) : shape(item);
      if (why) return why;
    }
  };
  const why = shape(node);
  if (why) return why;
  const value = nodeJS(node, doc);
  const saved = parseDocument(stringify(value), { intAsBigInt: true }).toJS({ mapAsMap: true });
  if (!isDeepStrictEqual(saved, nodeJS(big, bigDoc, true)) || !isDeepStrictEqual(JSON.parse(JSON.stringify(value)), value)) {
    return "wouldn't survive a save exactly";
  }
}

/**
 * The owned fields, validated like the core's optional text, and the top-level keys outside `ISSUE_FIELDS`. Throws,
 * saying what to quote, on an unknown one that isn't plain.
 */
function extraKeys(yaml: string, doc: Document, d: Data, where: string): ExtraKey[] {
  if (!isMap(doc.contents)) return [];
  const known = new Set<unknown>(ISSUE_FIELDS);
  const extra: ExtraKey[] = [];
  let after: string | null = null;
  let bigDoc: Document | undefined;
  doc.contents.items.forEach((pair, i) => {
    const key = isScalar(pair.key) ? pair.key.value : pair.key;
    if (typeof key === 'string' && known.has(key)) {
      after = key;
      return;
    }
    const field = typeof key === 'string' ? OWNED.get(key) : undefined;
    if (field) {
      const value = optText(d, field.key, where);
      if (value !== undefined) extra.push({ key: field.key, value, after: field.after });
      after = field.key;
      return;
    }
    bigDoc ??= parseDocument(yaml, { intAsBigInt: true });
    const big = (bigDoc.contents as typeof doc.contents).items[i];
    const name = JSON.stringify(String(key));
    const keyFailure = (why: string) => new Error(`${where}: unknown key ${name} ${why}`);
    if (typeof key !== 'string' && typeof key !== 'number') throw keyFailure('is not text or a number: quote the key');
    if (key === '__proto__') throw keyFailure('is reserved: rename it');
    const keyWhy = notPlain(pair.key, big.key, doc, bigDoc);
    if (keyWhy) throw keyFailure(`${keyWhy}: quote the key`);
    const valueWhy = notPlain(pair.value, big.value, doc, bigDoc);
    if (valueWhy) throw new Error(`${where}: the value of unknown key ${name} ${valueWhy}: quote it to keep it as text`);
    extra.push({ key, value: nodeJS(pair.value, doc), after });
  });
  return extra;
}

export function parseIssue(src: string, where: string): Issue {
  const { yaml, body } = frontmatterParts(src, where);
  const doc = parseDocument(yaml);
  if (doc.errors.length) throw yamlFailure(doc.errors[0], where, 1);
  const d = frontmatterData(doc.toJS() ?? {}, where);
  const id = canon(text(d, 'id', where));
  const project = canon(text(d, 'project', where));
  if (parseId(id)?.key !== project) throw new Error(`${where}: id '${id}' does not match project '${project}'`);
  const priority = d.priority == null ? undefined : oneOf(d, 'priority', ['high'] as const, where);
  const extra = extraKeys(yaml, doc, d, where);
  return {
    id,
    title: text(d, 'title', where),
    project,
    status: oneOf(d, 'status', ISSUE_STATUSES, where),
    blocked_by: textList(d, 'blocked_by', where).map(canon),
    priority,
    source: oneOf(d, 'source', SOURCES, where, 'user'),
    created: text(d, 'created', where),
    updated: text(d, 'updated', where),
    comments: commentList(d, where),
    ...(d.transitions != null && { transitions: transitionList(d, where) }),
    ...(extra.length && { extra }),
    body,
  };
}

/**
 * Owned fields go in their slot. Each unknown key goes after its `after` field, or the nearest set field before that
 * one; runs keep their order.
 */
export function serializeIssue(t: Issue): string {
  const { id, title, project, status, blocked_by, priority, source, created, updated, comments, transitions, extra = [], body } = t;
  const fields: Record<string, unknown> = {
    id,
    title,
    project,
    status,
    blocked_by,
    priority,
    source,
    created,
    updated,
    comments: comments.length ? comments : undefined,
    transitions,
  };
  const unknown: ExtraKey[] = [];
  for (const e of extra) {
    if (typeof e.key === 'string' && OWNED.has(e.key)) fields[e.key] = e.value;
    else unknown.push(e);
  }
  const anchor = (after: string | null): string | null => {
    for (let i = ISSUE_ORDER.indexOf(after as string); i >= 0; i--) if (fields[ISSUE_ORDER[i]] !== undefined) return ISSUE_ORDER[i];
    return null;
  };
  const data = new Map<unknown, unknown>();
  const place = (after: string | null) => {
    for (const e of unknown) if (anchor(e.after) === after) data.set(e.key, e.value);
  };
  place(null);
  for (const k of ISSUE_ORDER) {
    if (fields[k] === undefined) continue;
    data.set(k, fields[k]);
    place(k);
  }
  return joinFrontmatter(data, body);
}

/** The keys in `issue.extra` that aren't in `known`. */
export function unknownKeys(issue: Issue, known: Iterable<string>): string[] {
  const set = new Set(known);
  return (issue.extra ?? []).map((e) => String(e.key)).filter((k) => !set.has(k));
}

// --- disk ---

export function projectFile(dir: string, key: string): string {
  return join(dir, 'projects', `${key.toLowerCase()}.md`);
}

export function issueFile(dir: string, id: string): string {
  return join(dir, 'issues', `${id.toLowerCase()}.md`);
}

/** What a path relative to the data dir holds, if it's an issue or project file. Temp files from `writeAtomic` don't count. */
export function entityForPath(rel: string): { kind: 'issue' | 'project'; id: string } | undefined {
  const m = /^(issues|projects)[\\/]([^\\/]+)\.md$/.exec(rel);
  if (!m) return undefined;
  return { kind: m[1] === 'issues' ? 'issue' : 'project', id: canon(m[2]) };
}

function mdFiles(sub: string): string[] {
  return readdirSync(sub).filter((f) => f.endsWith('.md'));
}

export function writeAtomic(file: string, content: string): void {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, file);
}

export interface BadFile {
  /** Relative to the data dir, `issues/bel-12.md`. */
  file: string;
  /** The parse or validation error, without the file name. */
  error: string;
}

/** Passing `bad` makes a load lenient: files that fail are collected there instead of throwing. */
export interface LoadOptions {
  bad?: BadFile[];
}

function loadEach<T>(files: string[], load: (rel: string) => T, bad: BadFile[] | undefined): T[] {
  const out: T[] = [];
  for (const rel of files) {
    try {
      out.push(load(rel));
    } catch (e) {
      if (!bad) throw e;
      const msg = (e as Error).message;
      bad.push({ file: rel, error: msg.startsWith(rel) ? msg.slice(rel.length).replace(/^:\s*/, '') : msg });
    }
  }
  return out;
}

export function loadProjects(dir: string, { bad }: LoadOptions = {}): Project[] {
  const files = mdFiles(join(dir, 'projects')).map((f) => `projects/${f}`);
  return loadEach(
    files,
    (rel) => {
      const p = parseProject(readFileSync(join(dir, rel), 'utf8'), rel);
      if (`projects/${p.key.toLowerCase()}.md` !== rel) throw new Error(`${rel}: key '${p.key}' does not match file name`);
      return p;
    },
    bad,
  );
}

/**
 * Bump `CACHE_SHAPE` when the parsed `Issue` shape changes, so old entries aren't served. The known keys are hashed in
 * too, and the version is a string so it never equals the integer that code from before `extra` wrote.
 */
const CACHE_SHAPE = 3;
const ISSUE_CACHE_VERSION = `${CACHE_SHAPE}-${createHash('sha256').update(KNOWN_ISSUE_KEYS.join()).digest('hex').slice(0, 12)}`;

/** Only an issue that writes the same bytes after a trip through JSON may be served from the cache. */
const cacheSafe = (t: Issue) => serializeIssue(t) === serializeIssue(JSON.parse(JSON.stringify(t)));

type IssueCacheEntries = Record<string, { mtimeMs: number; size: number; issue: Issue }>;

export function issueCacheFile(dir: string): string {
  return join(dir, 'cache', 'issues.json');
}

function readIssueCache(dir: string): IssueCacheEntries {
  try {
    const c = JSON.parse(readFileSync(issueCacheFile(dir), 'utf8'));
    if (c?.version === ISSUE_CACHE_VERSION && isMapping(c.files)) return c.files as IssueCacheEntries;
  } catch {
    // missing or corrupt: rebuild
  }
  return {};
}

/** Parsed issues are cached in `cache/issues.json` by file mtime and size; bad files never are. */
export function loadIssues(dir: string, { bad }: LoadOptions = {}): Issue[] {
  const cached = readIssueCache(dir);
  const fresh: IssueCacheEntries = {};
  let misses = 0;
  const files = mdFiles(join(dir, 'issues')).map((f) => `issues/${f}`);
  const issues = loadEach(
    files,
    (rel) => {
      const file = join(dir, rel);
      const { mtimeMs, size } = statSync(file);
      const hit = cached[rel];
      if (hit && hit.mtimeMs === mtimeMs && hit.size === size) return (fresh[rel] = hit).issue;
      misses++;
      const t = parseIssue(readFileSync(file, 'utf8'), rel);
      if (`issues/${t.id.toLowerCase()}.md` !== rel) throw new Error(`${rel}: id '${t.id}' does not match file name`);
      if (cacheSafe(t)) fresh[rel] = { mtimeMs, size, issue: t };
      return t;
    },
    bad,
  );
  if (misses || Object.keys(fresh).length !== Object.keys(cached).length) {
    try {
      mkdirSync(join(dir, 'cache'), { recursive: true });
      writeAtomic(issueCacheFile(dir), JSON.stringify({ version: ISSUE_CACHE_VERSION, files: fresh }));
    } catch {
      // the cache is only a speedup
    }
  }
  return issues.sort((a, b) => compareIds(a.id, b.id));
}

export function saveProject(dir: string, p: Project): void {
  validateStoredKey(p.key, `project '${p.key}'`);
  writeAtomic(projectFile(dir, p.key), serializeProject(p));
}

export function deleteProjectFile(dir: string, key: string): void {
  unlinkSync(projectFile(dir, key));
}

export function orderFile(dir: string): string {
  return join(dir, 'order.yaml');
}

/** The hand-arranged project order from `order.yaml` (`project_order: [KEY, ...]`); `[]` when there's no file. */
export function loadOrder(dir: string): string[] {
  const file = orderFile(dir);
  if (!existsSync(file)) return [];
  const data = parseYaml(readFileSync(file, 'utf8'), 'order.yaml') ?? {};
  if (!isMapping(data)) throw new Error('order.yaml: not a mapping');
  return textList(data, 'project_order', 'order.yaml').map(canon);
}

export function saveOrder(dir: string, keys: string[]): void {
  writeAtomic(orderFile(dir), stringify({ project_order: keys }));
}

/** Listed keys first, in list order, then the unlisted ones by key. Listed keys with no project are ignored. */
export function sortByOrder(projects: Project[], order: string[]): Project[] {
  const rank = new Map(order.map((k, i) => [k, i]));
  return [...projects].sort((a, b) => {
    const ra = rank.get(a.key) ?? Infinity;
    const rb = rank.get(b.key) ?? Infinity;
    return ra === rb ? a.key.localeCompare(b.key) : ra - rb;
  });
}

export function saveIssue(dir: string, t: Issue): void {
  writeAtomic(issueFile(dir, t.id), serializeIssue(t));
}

export function deleteIssueFile(dir: string, id: string): void {
  unlinkSync(issueFile(dir, id));
}

export function nextIssueNumber(dir: string, key: string): number {
  let max = 0;
  for (const f of mdFiles(join(dir, 'issues'))) {
    const id = parseId(f.slice(0, -3));
    if (id?.key === key) max = Math.max(max, id.n);
  }
  return max + 1;
}

/** Allocates the next ID for `t.project` and writes the file, never overwriting an existing one. */
export function createIssue(dir: string, t: Omit<Issue, 'id'>): Issue {
  for (let n = nextIssueNumber(dir, t.project); ; n++) {
    const issue = { id: `${t.project}-${n}`, ...t };
    try {
      writeFileSync(issueFile(dir, issue.id), serializeIssue(issue), { flag: 'wx' });
      return issue;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
  }
}
