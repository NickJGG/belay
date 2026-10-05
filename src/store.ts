/**
 * File format for the data dir: `projects/<key>.md` and `tasks/<key>-<n>.md`, each a YAML
 * frontmatter block followed by a free-form markdown body. Everything that writes goes
 * through here so the format rules (field order, validation, ID allocation) live in one place.
 *
 * Keys and IDs are uppercase in memory and in frontmatter (`ELV`, `ELV-12`) and lowercase in
 * file names. Loading uppercases whatever it reads, so files from before that rule still load.
 */
import { existsSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { parse, stringify } from 'yaml';

export const TASK_STATUSES = ['idea', 'todo', 'doing', 'done', 'dropped'] as const;
export const PROJECT_STATUSES = ['active', 'paused', 'archived'] as const;
export const SOURCES = ['user', 'claude'] as const;

export type TaskStatus = (typeof TASK_STATUSES)[number];
export type ProjectStatus = (typeof PROJECT_STATUSES)[number];
export type Source = (typeof SOURCES)[number];

export interface Project {
  key: string;
  name: string;
  paths: string[];
  status: ProjectStatus;
  focus: boolean;
  group?: string;
  body: string;
}

export interface Task {
  id: string;
  title: string;
  project: string;
  status: TaskStatus;
  blocked_by: string[];
  priority?: 'high';
  source: Source;
  grill?: string;
  plan?: string;
  created: string;
  updated: string;
  body: string;
}

/** What a new key must be: 3–4 letters, like Linear's team keys and JIRA's project keys. */
export const KEY_RE = /^[A-Z]{3,4}$/;
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

export function today(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Forward slashes, no trailing slash: the form paths are stored in. */
export function normalizeStoredPath(p: string): string {
  return resolve(p).replaceAll('\\', '/').replace(/(?<=.)\/$/, '');
}

// --- frontmatter ---

type Data = Record<string, unknown>;

export function splitFrontmatter(text: string, where: string): { data: Data; body: string } {
  const m = /^---\r?\n([\s\S]*?)\r?\n?---(?:\r?\n|$)([\s\S]*)$/.exec(text);
  if (!m) throw new Error(`${where}: missing frontmatter`);
  const data = parse(m[1]) ?? {};
  if (typeof data !== 'object' || Array.isArray(data)) throw new Error(`${where}: frontmatter is not a mapping`);
  return { data, body: m[2].trim() };
}

function joinFrontmatter(data: Data, body: string): string {
  const head = `---\n${stringify(data, { lineWidth: 0 })}---\n`;
  return body.trim() ? `${head}\n${body.trim()}\n` : head;
}

// --- validation ---

function text(d: Data, k: string, where: string): string {
  const v = d[k];
  if ((typeof v === 'string' && v.trim()) || typeof v === 'number') return String(v);
  throw new Error(`${where}: '${k}' must be a non-empty string`);
}

function optText(d: Data, k: string, where: string): string | undefined {
  return d[k] == null ? undefined : text(d, k, where);
}

function oneOf<T extends string>(d: Data, k: string, allowed: readonly T[], where: string, fallback?: T): T {
  const v = d[k] ?? fallback;
  if (allowed.includes(v as T)) return v as T;
  throw new Error(`${where}: '${k}' must be one of ${allowed.join('|')} (got ${JSON.stringify(d[k])})`);
}

function textList(d: Data, k: string, where: string): string[] {
  const v = d[k] ?? [];
  if (Array.isArray(v) && v.every((x) => typeof x === 'string')) return v;
  throw new Error(`${where}: '${k}' must be a list of strings`);
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
  return {
    key,
    name: text(d, 'name', where),
    paths: textList(d, 'paths', where),
    status: oneOf(d, 'status', PROJECT_STATUSES, where, 'active'),
    focus: (d.focus as boolean | undefined) ?? false,
    group: optText(d, 'group', where),
    body,
  };
}

export function serializeProject(p: Project): string {
  const { key, name, paths, status, focus, group, body } = p;
  return joinFrontmatter({ key, name, paths, status, focus, group }, body);
}

// --- tasks ---

export function parseTask(src: string, where: string): Task {
  const { data: d, body } = splitFrontmatter(src, where);
  const id = canon(text(d, 'id', where));
  const project = canon(text(d, 'project', where));
  if (parseId(id)?.key !== project) throw new Error(`${where}: id '${id}' does not match project '${project}'`);
  const priority = d.priority == null ? undefined : oneOf(d, 'priority', ['high'] as const, where);
  return {
    id,
    title: text(d, 'title', where),
    project,
    status: oneOf(d, 'status', TASK_STATUSES, where),
    blocked_by: textList(d, 'blocked_by', where).map(canon),
    priority,
    source: oneOf(d, 'source', SOURCES, where, 'user'),
    grill: optText(d, 'grill', where),
    plan: optText(d, 'plan', where),
    created: text(d, 'created', where),
    updated: text(d, 'updated', where),
    body,
  };
}

export function serializeTask(t: Task): string {
  const { id, title, project, status, blocked_by, priority, source, grill, plan, created, updated, body } = t;
  return joinFrontmatter({ id, title, project, status, blocked_by, priority, source, grill, plan, created, updated }, body);
}

// --- disk ---

export function projectFile(dir: string, key: string): string {
  return join(dir, 'projects', `${key.toLowerCase()}.md`);
}

export function taskFile(dir: string, id: string): string {
  return join(dir, 'tasks', `${id.toLowerCase()}.md`);
}

/** What a path relative to the data dir holds, if it's a task or project file. Temp files from `writeAtomic` don't count. */
export function entityForPath(rel: string): { kind: 'task' | 'project'; id: string } | undefined {
  const m = /^(tasks|projects)[\\/]([^\\/]+)\.md$/.exec(rel);
  if (!m) return undefined;
  return { kind: m[1] === 'tasks' ? 'task' : 'project', id: canon(m[2]) };
}

function mdFiles(sub: string): string[] {
  return readdirSync(sub).filter((f) => f.endsWith('.md'));
}

export function writeAtomic(file: string, content: string): void {
  const tmp = `${file}.${process.pid}.tmp`;
  writeFileSync(tmp, content);
  renameSync(tmp, file);
}

export function loadProjects(dir: string): Project[] {
  const sub = join(dir, 'projects');
  return mdFiles(sub).map((f) => {
    const p = parseProject(readFileSync(join(sub, f), 'utf8'), `projects/${f}`);
    if (`${p.key.toLowerCase()}.md` !== f) throw new Error(`projects/${f}: key '${p.key}' does not match file name`);
    return p;
  });
}

export function loadTasks(dir: string): Task[] {
  const sub = join(dir, 'tasks');
  return mdFiles(sub)
    .map((f) => {
      const t = parseTask(readFileSync(join(sub, f), 'utf8'), `tasks/${f}`);
      if (`${t.id.toLowerCase()}.md` !== f) throw new Error(`tasks/${f}: id '${t.id}' does not match file name`);
      return t;
    })
    .sort((a, b) => compareIds(a.id, b.id));
}

export function saveProject(dir: string, p: Project): void {
  validateStoredKey(p.key, `project '${p.key}'`);
  writeAtomic(projectFile(dir, p.key), serializeProject(p));
}

export function orderFile(dir: string): string {
  return join(dir, 'order.yaml');
}

/** The hand-arranged project order from `order.yaml` (`project_order: [KEY, ...]`); `[]` when there's no file. */
export function loadOrder(dir: string): string[] {
  const file = orderFile(dir);
  if (!existsSync(file)) return [];
  const data = parse(readFileSync(file, 'utf8')) ?? {};
  if (typeof data !== 'object' || Array.isArray(data)) throw new Error('order.yaml: not a mapping');
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

export function saveTask(dir: string, t: Task): void {
  writeAtomic(taskFile(dir, t.id), serializeTask(t));
}

export function deleteTaskFile(dir: string, id: string): void {
  unlinkSync(taskFile(dir, id));
}

export function nextTaskNumber(dir: string, key: string): number {
  let max = 0;
  for (const f of mdFiles(join(dir, 'tasks'))) {
    const id = parseId(f.slice(0, -3));
    if (id?.key === key) max = Math.max(max, id.n);
  }
  return max + 1;
}

/** Allocates the next ID for `t.project` and writes the file, never overwriting an existing one. */
export function createTask(dir: string, t: Omit<Task, 'id'>): Task {
  for (let n = nextTaskNumber(dir, t.project); ; n++) {
    const task = { id: `${t.project}-${n}`, ...t };
    try {
      writeFileSync(taskFile(dir, task.id), serializeTask(task), { flag: 'wx' });
      return task;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'EEXIST') throw e;
    }
  }
}
