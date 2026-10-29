/** Grill's session kind on the server: its sessions, list rows and live Tabs. Loaded by `manifest.server.ts`. */
import { isClosed, type Issue } from "../../../../web/src/lib/issues.ts";
import type { ItemBase, ItemContext, KindRuntime, LiveBase } from "../../../../web/src/lib/session-kind.ts";
import { byUpdated } from "../../../../web/src/lib/sessions.ts";
import { projectOf } from "./filing.ts";
import { grillHref } from "./hrefs.ts";
import { byGrillOf, stage, type Stage } from "./issues.ts";
import { readSessionDoc } from "./session-files.ts";
import { listSessions, readGrill, type GrillSession } from "./sessions.ts";

export type GrillItem = ItemBase & {
  stage: Stage;
  /** Closed issues out of all the session's issues, when it has any. */
  progress?: { done: number; total: number };
  /** Building only: the first open issue in id order. */
  next?: Pick<Issue, "id" | "title" | "status">;
  /** How many questions it asked; unset without a session.json. */
  questions?: number;
};

export type GrillLive = GrillItem & LiveBase & { kind: "grill" };

function item(s: GrillSession, ctx: ItemContext): GrillItem {
  const issues = byGrillOf(ctx.issues).get(s.slug) ?? [];
  const st = stage(s, issues);
  const out: GrillItem = {
    slug: s.slug,
    topic: s.topic,
    status: s.status,
    project: s.project,
    updated: s.updated,
    open: s.open,
    live: ctx.live.has(s.slug),
    mark: ctx.marks.get(s.slug) ?? null,
    stage: st,
    questions: s.questions?.length,
  };
  if (issues.length) out.progress = { done: issues.filter(isClosed).length, total: issues.length };
  const next = issues.find((i) => !isClosed(i));
  if (st === "building" && next) out.next = { id: next.id, title: next.title, status: next.status };
  return out;
}

export const runtime = {
  read: readGrill,
  list: (root: string, memo) => listSessions(root, memo).sort(byUpdated),
  item,
  filed: (sessions, projects, issues) => projectOf(sessions, projects, byGrillOf(issues)),
  readDoc: readSessionDoc,
  liveItems: async (entries, ctx) =>
    entries.map(({ l, s }) => {
      const state = { working: l.working, connected: l.connected, wt: l.wt };
      const base: GrillItem = s ? item(s, ctx) : { slug: l.slug, topic: l.slug, status: "in-progress", live: true, mark: null, stage: "grilling" };
      return { ...base, ...state, kind: "grill" as const, href: grillHref(l.slug) };
    }),
} satisfies KindRuntime<GrillSession, GrillLive, GrillItem> & { readDoc: typeof readSessionDoc };
