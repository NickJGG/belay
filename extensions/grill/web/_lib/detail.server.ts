import "server-only";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { connection } from "next/server";
import type { ChatEntry, OpenTurn } from "@/lib/chat";
import { belay, marksOf, sessionMemo, type Mark } from "@/lib/data";
import { runtimeOf, sessionRoots } from "@/lib/extensions.server";
import { parseFrontmatter } from "@/lib/frontmatter";
import { liveSessions, openTurn, usageFor } from "@/lib/hub";
import { projectsOf } from "@/lib/projects";
import { readChat } from "@/lib/session-files";
import type { ItemContext } from "@/lib/session-kind";
import { isSlug } from "@/lib/sessions";
import type { Issue } from "../../../../src/store.ts";
import type { Usage } from "@/lib/usage";
import { byGrillOf } from "./issues";
import { MOCK_FILES, type MockFile } from "./mock";
import type { SessionDoc } from "./session-doc";
import type { GrillLive, runtime } from "./runtime.server";
import type { GrillSession } from "./sessions";

const grillRuntime = async () => (await runtimeOf("grill")) as typeof runtime;

export type SessionPage = { session: GrillSession; live: GrillLive | null; projectName?: string; mark: Mark | null };

/** One grill for its page and the drill-in sidebar; null when there's none. */
export async function sessionData(slug: string): Promise<SessionPage | null> {
  if (!isSlug(slug)) return null;
  await connection();
  const root = sessionRoots().grill;
  if (!root) return null;
  const grill = await grillRuntime();
  const session = grill.read(root, slug, sessionMemo());
  if (!session) return null;
  const live = (await liveSessions()).filter((l) => l.slug === slug);
  const projects = projectsOf(belay());
  const projectName = session.project ? projects.find((p) => p.key === session.project)?.name : undefined;
  const issues = belay().issues;
  const m = marksOf(grill.filed([session], projects, issues));
  const ctx: ItemContext = { live: new Set(live.map((l) => l.slug)), marks: m, issues };
  const items = await grill.liveItems(live.map((l) => ({ l, s: session })), ctx);
  return { session, live: items[0] ?? null, projectName, mark: m.get(slug) ?? null };
}

/** An issue the grill links to, as its Overview lists it. */
export type GrillIssue = Pick<Issue, "id" | "title" | "status" | "priority">;

export type SessionDetail = SessionPage & {
  issues: GrillIssue[];
  /** Null for a legacy grill, or a fresh one with only bridge.json. */
  doc: SessionDoc | null;
  chat: ChatEntry[];
  turn: OpenTurn | null;
  usage: Usage | null;
  /** Each mock file present, with its mtime (a cache-buster for the frames' URLs). */
  files: Partial<Record<MockFile, number>>;
  /** A legacy grill: its markdown body, and whether it has an old preview.html. */
  legacy: { markdown: string; preview: boolean } | null;
};

/** Everything the grill page renders; null when there's no such grill. */
export async function sessionDetail(slug: string): Promise<SessionDetail | null> {
  const page = await sessionData(slug);
  const root = sessionRoots().grill;
  if (!page || !root) return null;
  const dir = path.join(root, slug);
  const issues = (byGrillOf(belay().issues).get(slug) ?? []).map(({ id, title, status, priority }) => ({ id, title, status, priority }));
  if (page.session.legacy) {
    let markdown = "";
    try {
      markdown = parseFrontmatter(readFileSync(path.join(dir, `${slug}.md`), "utf8")).body;
    } catch {}
    return { ...page, issues, doc: null, chat: [], turn: null, usage: null, files: {}, legacy: { markdown, preview: existsSync(path.join(dir, "preview.html")) } };
  }
  const files: SessionDetail["files"] = {};
  for (const name of MOCK_FILES) {
    try {
      files[name] = statSync(path.join(dir, name)).mtimeMs;
    } catch {}
  }
  return { ...page, issues, doc: (await grillRuntime()).readDoc(dir), chat: readChat(dir), turn: openTurn(slug), usage: usageFor(slug), files, legacy: null };
}
