/**
 * Log entries: `log/<work day>.yaml` in the data dir, holding `entries: [...]` oldest first. The file's day is
 * the work day an entry counts toward, so a backdated entry lands in an earlier file than its `at`.
 * An entry's address is `<day>/<n>`, 1-based.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { parse, stringify } from 'yaml';
import { AT_RE, DAY_RE, SOURCES, canon, isMapping, oneOf, optPositiveInt, optText, writeAtomic, type Source } from './store.ts';

export interface LogEntry {
  project: string;
  /** Real local creation time, `YYYY-MM-DDTHH:MM`. */
  at: string;
  by: Source;
  session?: string;
  text: string;
  kind?: string;
  /** Only with `kind`; counts as 1 when absent. */
  count?: number;
  minutes?: number;
  issue?: string;
}

/** An entry with the work day it belongs to and its 1-based position in that day's file. */
export type DatedEntry = LogEntry & { day: string; n: number };

export function logDir(dir: string): string {
  return join(dir, 'log');
}

export function logFile(dir: string, day: string): string {
  return join(logDir(dir), `${day}.yaml`);
}

export function parseLog(src: string, where: string): LogEntry[] {
  const data = parse(src) ?? {};
  if (!isMapping(data)) throw new Error(`${where}: not a mapping`);
  const v = data.entries ?? [];
  if (!Array.isArray(v)) throw new Error(`${where}: 'entries' must be a list`);
  return v.map((e, i) => {
    const loc = `${where} entry #${i + 1}`;
    if (!isMapping(e)) throw new Error(`${loc}: not a mapping`);
    if (typeof e.project !== 'string' || !e.project.trim()) throw new Error(`${loc}: 'project' must be a non-empty string`);
    if (typeof e.at !== 'string' || !AT_RE.test(e.at)) throw new Error(`${loc}: 'at' must be YYYY-MM-DDTHH:MM (got ${JSON.stringify(e.at)})`);
    if (typeof e.text !== 'string' || !e.text.trim()) throw new Error(`${loc}: 'text' must be a non-empty string`);
    const session = optText(e, 'session', loc);
    const kind = optText(e, 'kind', loc);
    const count = optPositiveInt(e, 'count', loc);
    const minutes = optPositiveInt(e, 'minutes', loc);
    const issue = optText(e, 'issue', loc);
    return {
      project: canon(e.project),
      at: e.at,
      by: oneOf(e, 'by', SOURCES, loc),
      ...(session && { session }),
      text: e.text,
      ...(kind && { kind }),
      ...(count && { count }),
      ...(minutes && { minutes }),
      ...(issue && { issue: canon(issue) }),
    };
  });
}

export function serializeLog(entries: LogEntry[]): string {
  return stringify({ entries }, { lineWidth: 0 });
}

/** `[]` when the day has no file. */
export function loadLog(dir: string, day: string): LogEntry[] {
  const file = logFile(dir, day);
  return existsSync(file) ? parseLog(readFileSync(file, 'utf8'), `log/${day}.yaml`) : [];
}

/** Removes the day's file when `entries` is empty. */
export function saveLog(dir: string, day: string, entries: LogEntry[]): void {
  const file = logFile(dir, day);
  if (!entries.length) {
    if (existsSync(file)) unlinkSync(file);
    return;
  }
  mkdirSync(logDir(dir), { recursive: true });
  writeAtomic(file, serializeLog(entries));
}

/** Entries on work days `from`..`to` inclusive, oldest first. Only reads the files in range. */
export function loadLogs(dir: string, from: string, to: string): DatedEntry[] {
  const sub = logDir(dir);
  if (!existsSync(sub)) return [];
  return readdirSync(sub)
    .filter((f) => f.endsWith('.yaml') && DAY_RE.test(f.slice(0, -5)))
    .map((f) => f.slice(0, -5))
    .filter((day) => day >= from && day <= to)
    .sort()
    .flatMap((day) => loadLog(dir, day).map((e, i) => ({ ...e, day, n: i + 1 })));
}

export function parseLogAddress(addr: string): { day: string; n: number } {
  const m = /^(\d{4}-\d{2}-\d{2})\/#?(\d+)$/.exec(addr.trim());
  if (!m || Number(m[2]) < 1) throw new Error(`log entry address must be <YYYY-MM-DD>/<n> (got '${addr}')`);
  return { day: m[1], n: Number(m[2]) };
}

/** The text's first line, and whether anything follows it. */
export function firstLine(text: string): { line: string; more: boolean } {
  const i = text.indexOf('\n');
  return i < 0 ? { line: text, more: false } : { line: text.slice(0, i).trimEnd(), more: text.slice(i).trim() !== '' };
}
