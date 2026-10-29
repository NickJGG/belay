import "server-only";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { connection } from "next/server";
import type { ChatEntry, OpenTurn } from "@/lib/chat";
import { belay, marksOf, sessionMemo, type LiveItem, type Mark } from "@/lib/data";
import { runtimeOf, sessionRoots } from "@/lib/extensions.server";
import { parseFrontmatter } from "@/lib/frontmatter";
import { liveSessions, openTurn, usageFor } from "@/lib/hub";
import { projectsOf } from "@/lib/projects";
import { readChat } from "@/lib/session-files";
import type { ItemContext } from "@/lib/session-kind";
import { isSlug } from "@/lib/sessions";
import type { Usage } from "@/lib/usage";
import { MOCK_FILES, type MockFile } from "./mock";
import type { SessionDoc } from "./session-doc";
import type { GrillSession } from "./sessions";

export type SessionPage = { session: GrillSession; live: LiveItem | null; projectName?: string; mark: Mark | null };

/** One grill for its page and the drill-in sidebar; null when there's none. */
export async function sessionData(slug: string): Promise<SessionPage | null> {
  if (!isSlug(slug)) return null;
  await connection();
  const root = sessionRoots().grill;
  if (!root) return null;
  const grill = await runtimeOf("grill");
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

export type SessionDetail = SessionPage & {
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
  if (page.session.legacy) {
    let markdown = "";
    try {
      markdown = parseFrontmatter(readFileSync(path.join(dir, `${slug}.md`), "utf8")).body;
    } catch {}
    return { ...page, doc: null, chat: [], turn: null, usage: null, files: {}, legacy: { markdown, preview: existsSync(path.join(dir, "preview.html")) } };
  }
  const files: SessionDetail["files"] = {};
  for (const name of MOCK_FILES) {
    try {
      files[name] = statSync(path.join(dir, name)).mtimeMs;
    } catch {}
  }
  return { ...page, doc: (await runtimeOf("grill")).readDoc(dir), chat: readChat(dir), turn: openTurn(slug), usage: usageFor(slug), files, legacy: null };
}
