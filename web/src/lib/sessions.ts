/**
 * Session folders on disk, read-only: `<root>/<slug>/session.json` (plugin/references/session-format.md), or for a
 * legacy grill only `<slug>.md`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { parseFrontmatter, readHead } from "./frontmatter.ts";

export type QuestionStatus = "open" | "resolved" | "deferred" | "dropped" | "see";
export type QuestionSummary = { n: number; title: string; short: string; status: QuestionStatus };

export type SessionSummary = {
  slug: string;
  topic: string;
  status: string;
  project?: string;
  started?: string;
  updated?: string;
  /** The session's "next question" line. */
  open?: string;
  /** Null for a legacy grill. */
  questions: QuestionSummary[] | null;
  mock: boolean;
  /** A grill from before session.json: only its `<slug>.md`, shown read-only. */
  legacy: boolean;
  /** Set, with `course`, on a lesson's folder (session-format.md's Lessons); unset on a grill. */
  kind?: "lesson";
  course?: string;
};

export const isSlug = (s: string): boolean => /^[a-z0-9][a-z0-9-]*$/.test(s);

const QUESTION_STATUSES = new Set<string>(["open", "resolved", "deferred", "dropped", "see"]);

const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

function fromJson(slug: string, j: Record<string, unknown>): SessionSummary {
  const qs = Array.isArray(j.questions) ? (j.questions as Record<string, unknown>[]) : [];
  return {
    slug,
    topic: str(j.topic) ?? slug,
    status: str(j.status) ?? "in-progress",
    project: str(j.project)?.toUpperCase(),
    started: str(j.started),
    updated: str(j.updated) ?? str(j.started),
    open: str(j.open),
    questions: qs
      .filter((q) => typeof q?.n === "number")
      .map((q) => ({
        n: q.n as number,
        title: str(q.title) ?? "",
        short: str(q.short) ?? str(q.title) ?? `Q${q.n}`,
        status: QUESTION_STATUSES.has(q.status as string) ? (q.status as QuestionStatus) : "open",
      })),
    mock: j.mock != null && typeof j.mock === "object",
    legacy: false,
    ...(j.kind === "lesson" ? { kind: "lesson" as const, course: str(j.course) ?? "" } : {}),
  };
}

function fromMarkdown(slug: string, head: string): SessionSummary {
  const { data } = parseFrontmatter(head);
  return {
    slug,
    topic: data.topic ?? slug,
    status: data.status ?? "in-progress",
    project: data.project?.toUpperCase(),
    started: data.started,
    updated: data.updated ?? data.started,
    questions: null,
    mock: false,
    legacy: true,
  };
}

/** Parsed sessions keyed by file path, reused while the file's mtime is unchanged. */
export type SessionMemo = Map<string, { mtimeMs: number; session: SessionSummary }>;

function memoized(memo: SessionMemo | undefined, path: string, read: () => SessionSummary): SessionSummary {
  if (!memo) return read();
  const { mtimeMs } = statSync(path);
  const hit = memo.get(path);
  if (hit?.mtimeMs === mtimeMs) return hit.session;
  const session = read();
  memo.set(path, { mtimeMs, session });
  return session;
}

/**
 * One session folder of `root`: session.json, else a bare `bridge.json`, which a session attached before its first
 * save leaves, else a legacy `<slug>.md`. Null when the folder holds none of these or they don't parse.
 */
export function readSession(root: string, slug: string, memo?: SessionMemo): SessionSummary | null {
  const dir = join(root, slug);
  const json = join(dir, "session.json");
  const md = join(dir, `${slug}.md`);
  try {
    if (existsSync(json)) return memoized(memo, json, () => fromJson(slug, JSON.parse(readFileSync(json, "utf8"))));
    if (existsSync(join(dir, "bridge.json"))) {
      return { slug, topic: slug, status: "in-progress", questions: [], mock: false, legacy: false };
    }
    if (existsSync(md)) return memoized(memo, md, () => fromMarkdown(slug, readHead(md)));
  } catch {
    // a half-written or malformed file: skip the session until it parses
  }
  return null;
}

function slugsIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && isSlug(e.name))
    .map((e) => e.name);
}

/** Every grill under `root`. Lessons only show as live Tabs. */
export function listSessions(root: string, memo?: SessionMemo): SessionSummary[] {
  return slugsIn(root)
    .map((slug) => readSession(root, slug, memo))
    .filter((s): s is SessionSummary => s != null && s.kind !== "lesson");
}

/** Most recently updated first; ties by slug. */
export function byUpdated(a: SessionSummary, b: SessionSummary): number {
  return (b.updated ?? "").localeCompare(a.updated ?? "") || a.slug.localeCompare(b.slug);
}
