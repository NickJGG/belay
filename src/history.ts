/**
 * Session history from Claude Code transcripts (`<claudeDir>/projects/<encoded cwd>/<session id>.jsonl`),
 * mapped to projects by launch cwd, plus the git commits made inside each session's time window.
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { git } from './gitlog.ts';
import { projectForCwd } from './query.ts';
import { writeAtomic, type Project } from './store.ts';
import { addDays } from './workday.ts';

export interface Commit {
  hash: string;
  time: string;
  subject: string;
}

export interface Session {
  id: string;
  cwd: string;
  title: string;
  start: string;
  end: string;
  project?: string;
  commits?: Commit[];
}

/** Claude Code names a transcript folder after the launch cwd, with every non-alphanumeric character as `-`. */
export function encodeCwd(path: string): string {
  return path.replace(/[^a-zA-Z0-9]/g, '-').toLowerCase();
}

const TS = '"timestamp":"';

/**
 * The string value of top-level `key` on the first (or last) line containing `marker`. Quotes inside JSON
 * string values are escaped, so a marker can only match real keys — but possibly nested ones, hence the loop.
 */
function findValue(text: string, marker: string, key: string, fromEnd: boolean): string | undefined {
  let i = fromEnd ? text.lastIndexOf(marker) : text.indexOf(marker);
  for (let tries = 0; i >= 0 && tries < 20; tries++) {
    const start = text.lastIndexOf('\n', i) + 1;
    const nl = text.indexOf('\n', i);
    const end = nl < 0 ? text.length : nl;
    try {
      const v = JSON.parse(text.slice(start, end))[key];
      if (typeof v === 'string') return v;
    } catch {
      // the last line may still be mid-write
    }
    if (fromEnd) i = start < 2 ? -1 : text.lastIndexOf(marker, start - 2);
    else i = nl < 0 ? -1 : text.indexOf(marker, nl + 1);
  }
  return undefined;
}

function findTimestamp(text: string, fromEnd: boolean): string | undefined {
  let i = fromEnd ? text.lastIndexOf(TS) : text.indexOf(TS);
  while (i >= 0) {
    const from = i + TS.length;
    const close = text.indexOf('"', from);
    const v = close < 0 ? '' : text.slice(from, close);
    if (!Number.isNaN(Date.parse(v))) return v;
    i = fromEnd ? text.lastIndexOf(TS, i - 1) : text.indexOf(TS, from);
  }
  return undefined;
}

/** Pulls a session's summary out of a transcript without parsing every line. Undefined for sessions without a prompt. */
export function parseTranscript(text: string, id: string): Session | undefined {
  const cwd = findValue(text, '"cwd":"', 'cwd', false);
  const start = findTimestamp(text, false);
  const end = findTimestamp(text, true);
  const title =
    findValue(text, '"type":"ai-title"', 'aiTitle', true) ?? findValue(text, '"type":"last-prompt"', 'lastPrompt', true);
  if (!cwd || !start || !end || !title?.trim()) return undefined;
  return { id, cwd, title: title.replace(/\s+/g, ' ').trim(), start, end };
}

/** Transcript files, most recently modified first. */
function transcripts(claudeDir: string, keepDir: (encoded: string) => boolean) {
  const root = join(claudeDir, 'projects');
  if (!existsSync(root)) return [];
  const files: { id: string; file: string; mtime: number }[] = [];
  for (const d of readdirSync(root, { withFileTypes: true })) {
    if (!d.isDirectory() || !keepDir(d.name.toLowerCase())) continue;
    for (const f of readdirSync(join(root, d.name))) {
      if (!f.endsWith('.jsonl')) continue;
      const file = join(root, d.name, f);
      files.push({ id: f.slice(0, -'.jsonl'.length), file, mtime: statSync(file).mtimeMs });
    }
  }
  return files.sort((a, b) => b.mtime - a.mtime);
}

export interface SessionQuery {
  /** Only this project's sessions; only transcript folders that could hold them are read. */
  project?: Project;
  limit: number;
  exclude?: string;
}

/** The most recent sessions, newest first, each tagged with the project its launch cwd maps to. */
export function recentSessions(claudeDir: string, projects: Project[], q: SessionQuery): Session[] {
  const prefixes = q.project?.paths.map(encodeCwd);
  const out: Session[] = [];
  for (const t of transcripts(claudeDir, (name) => !prefixes || prefixes.some((p) => name.startsWith(p)))) {
    if (out.length >= q.limit) break;
    if (t.id === q.exclude) continue;
    const s = parseTranscript(readFileSync(t.file, 'utf8'), t.id);
    if (!s) continue;
    s.project = projectForCwd(projects, s.cwd)?.key;
    if (q.project && s.project !== q.project.key) continue;
    out.push(s);
  }
  return out;
}

/** The path itself when it's inside a repo, else its immediate child repos (a folder of several repos). */
function repoDirs(path: string): string[] {
  if (!existsSync(path)) return [];
  if (git(path, ['rev-parse', '--git-dir']) !== undefined) return [path];
  return readdirSync(path, { withFileTypes: true })
    .filter((d) => d.isDirectory() && existsSync(join(path, d.name, '.git')))
    .map((d) => join(path, d.name));
}

/** Commits under the project's paths, on any local branch, committed between `since` and `until`. */
export function commitsBetween(project: Project, since: string, until: string): Commit[] {
  const byHash = new Map<string, Commit>();
  for (const dir of project.paths.flatMap(repoDirs)) {
    const log = git(dir, ['log', '--branches', 'HEAD', `--since=${since}`, `--until=${until}`, '--format=%h%x09%cI%x09%s', '--', '.']);
    for (const line of log?.split('\n') ?? []) {
      const [hash, time, ...subject] = line.split('\t');
      if (hash && time) byHash.set(hash, { hash, time, subject: subject.join('\t') });
    }
  }
  return [...byHash.values()].sort((a, b) => Date.parse(a.time) - Date.parse(b.time));
}

/** Commits during the Mon–Sun week starting `week`, by work day (each starts at 4am). */
export function weekCommits(project: Project, week: string): Commit[] {
  return commitsBetween(project, `${week} 04:00`, `${addDays(week, 7)} 04:00`);
}

/**
 * Commit work days of goal projects for the current week, written by the digest so the status line can
 * count commits without running git after every message. Derived data: safe to delete.
 */
export interface CommitDayCache {
  week: string;
  projects: Record<string, string[]>;
}

export function commitCacheFile(dataDir: string): string {
  return join(dataDir, 'cache', 'commit-days.json');
}

/** Empty when the cache is missing, unreadable or from another week. */
export function readCommitDays(dataDir: string, week: string): Record<string, string[]> {
  try {
    const c = JSON.parse(readFileSync(commitCacheFile(dataDir), 'utf8')) as CommitDayCache;
    return c.week === week && c.projects && typeof c.projects === 'object' ? c.projects : {};
  } catch {
    return {};
  }
}

export function writeCommitDays(dataDir: string, cache: CommitDayCache): void {
  mkdirSync(join(dataDir, 'cache'), { recursive: true });
  writeAtomic(commitCacheFile(dataDir), `${JSON.stringify(cache, null, 2)}
`);
}

/** Fills `commits` on each session that maps to a project, with one `git log` per repo. */
export function attachCommits(sessions: Session[], projects: Project[]): void {
  for (const project of projects) {
    const own = sessions.filter((s) => s.project === project.key);
    if (!own.length) continue;
    const since = own.map((s) => s.start).sort()[0];
    const until = own.map((s) => s.end).sort().at(-1)!;
    const commits = commitsBetween(project, since, until);
    for (const s of own) {
      const [from, to] = [Date.parse(s.start), Date.parse(s.end)];
      s.commits = commits.filter((c) => Date.parse(c.time) >= from && Date.parse(c.time) <= to);
    }
  }
}

/** Local `YYYY-MM-DD` and `HH:MM` for an ISO timestamp. */
export function localStamp(iso: string): { date: string; time: string } {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`,
    time: `${pad(d.getHours())}:${pad(d.getMinutes())}`,
  };
}

export function duration(start: string, end: string): string {
  const m = Math.round((Date.parse(end) - Date.parse(start)) / 60000);
  if (m < 60) return `${m}m`;
  if (m < 24 * 60) return `${Math.floor(m / 60)}h${String(m % 60).padStart(2, '0')}`;
  return `${Math.round(m / (24 * 60))}d`;
}
