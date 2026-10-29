/** A grill's folder: its session.json, or for a grill from before session.json only `<slug>.md`. */
import { parseFrontmatter, readHead } from "../../../../web/src/lib/frontmatter.ts";
import { baseFromJson, readSession, slugsIn, str, type SessionBase, type SessionFormat, type SessionMemo } from "../../../../web/src/lib/sessions.ts";

export type QuestionStatus = "open" | "resolved" | "deferred" | "dropped" | "see";
export type QuestionSummary = { n: number; title: string; short: string; status: QuestionStatus };

export type GrillSession = SessionBase & {
  /** Null for a legacy grill. */
  questions: QuestionSummary[] | null;
  mock: boolean;
  /** A grill from before session.json: only its `<slug>.md`, shown read-only. */
  legacy: boolean;
};

const QUESTION_STATUSES = new Set<string>(["open", "resolved", "deferred", "dropped", "see"]);

function fromJson(slug: string, j: Record<string, unknown>): GrillSession | null {
  // A lesson's folder (session-format.md's Lessons) is never a grill.
  if (j.kind === "lesson") return null;
  const qs = Array.isArray(j.questions) ? (j.questions as Record<string, unknown>[]) : [];
  return {
    ...baseFromJson(slug, j),
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
  };
}

function fromMarkdown(slug: string, file: string): GrillSession {
  const { data } = parseFrontmatter(readHead(file));
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

const GRILL: SessionFormat<GrillSession> = {
  json: fromJson,
  bare: (slug) => ({ slug, topic: slug, status: "in-progress", questions: [], mock: false, legacy: false }),
  fallback: { file: (slug) => `${slug}.md`, read: fromMarkdown },
};

export const readGrill = (root: string, slug: string, memo?: SessionMemo) => readSession(root, slug, memo, GRILL);

/** Every grill under `root`. */
export function listSessions(root: string, memo?: SessionMemo): GrillSession[] {
  return slugsIn(root)
    .map((slug) => readGrill(root, slug, memo))
    .filter((s) => s != null);
}
