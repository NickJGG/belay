/**
 * Session folders on disk, read-only. Sear sessions (`<sear>/<slug>/session.json`, see
 * plugin/references/session-format.md) and old grill sessions, which have only `<slug>.md`.
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
  /** Null for a session with no session.json: an old grill session, or an attached one not yet saved. */
  questions: QuestionSummary[] | null;
  mock: boolean;
  /** `grill` for a session read from the old grill sessions folder. */
  source: "sear" | "grill";
  /** Set, with `course`, on a lesson's folder (session-format.md's Lessons); unset on a grill. */
  kind?: "lesson";
  course?: string;
};

export type SessionRoot = { dir: string; source: SessionSummary["source"] };

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
    source: "sear",
    ...(j.kind === "lesson" ? { kind: "lesson" as const, course: str(j.course) ?? "" } : {}),
  };
}

function fromMarkdown(slug: string, head: string, source: SessionSummary["source"]): SessionSummary {
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
    source,
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
 * One session folder: session.json, else `<slug>.md`, else (Sear only) a bare `bridge.json`, which a session
 * attached before its first save leaves. Null when the folder holds none of these or they don't parse.
 */
export function readSession(root: SessionRoot, slug: string, memo?: SessionMemo): SessionSummary | null {
  const dir = join(root.dir, slug);
  const json = join(dir, "session.json");
  const md = join(dir, `${slug}.md`);
  try {
    if (root.source === "sear" && existsSync(json)) {
      return memoized(memo, json, () => fromJson(slug, JSON.parse(readFileSync(json, "utf8"))));
    }
    if (existsSync(md)) return memoized(memo, md, () => fromMarkdown(slug, readHead(md), root.source));
    if (root.source === "sear" && existsSync(join(dir, "bridge.json"))) {
      return { slug, topic: slug, status: "in-progress", questions: [], mock: false, source: "sear" };
    }
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

/** Every grill under the roots; on a slug in several roots the first root's wins. Lessons only show as live Tabs. */
export function listSessions(roots: SessionRoot[], memo?: SessionMemo): SessionSummary[] {
  const seen = new Map<string, SessionSummary>();
  for (const root of roots) {
    for (const slug of slugsIn(root.dir)) {
      if (seen.has(slug)) continue;
      const s = readSession(root, slug, memo);
      if (s) seen.set(slug, s);
    }
  }
  return [...seen.values()].filter((s) => s.kind !== "lesson");
}

/** Most recently updated first; ties by slug. */
export function byUpdated(a: SessionSummary, b: SessionSummary): number {
  return (b.updated ?? "").localeCompare(a.updated ?? "") || a.slug.localeCompare(b.slug);
}
