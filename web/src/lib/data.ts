import "server-only";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { connection } from "next/server";
import { cache } from "react";
import { dataDir } from "../../../src/config.ts";
import { Ctx as BelayCtx } from "../../../src/ops.ts";
import type { ChatEntry, OpenTurn } from "./chat";
import { grillDir, searDir, sessionRoots } from "./config";
import { parseFrontmatter } from "./frontmatter";
import { isClosed, issuesByGrill, stage, STAGES, type Issue, type Stage } from "./issues";
import { MOCK_FILES, type MockFile } from "./mock";
import type { SessionDoc } from "./session-doc";
import { readChat, readSessionDoc } from "./session-files";
import { liveSessions, openTurn, usageFor, type LiveSession } from "./hub";
import { fileSessions, projectsOf, type Project } from "./projects";
import type { Usage } from "./usage";
import { byUpdated, isSlug, listSessions, readSession, type SessionMemo, type SessionSummary } from "./sessions";

// On globalThis so dev-mode module reloads keep the parsed sessions.
const g = globalThis as typeof globalThis & { __searMemo?: SessionMemo };
const memo = () => (g.__searMemo ??= new Map());

/** Belay's data, loaded once per request. Lenient: pages render what loaded rather than failing on a bad file. */
export const belay = cache(() => new BelayCtx(dataDir(), { lenient: true }));

export const UNFILED = "unfiled";

/** The project a session is filed under, for its marker; `iconV` (the icon's mtime) is set when it has an icon. */
export type Mark = { key: string; name: string; iconV?: number };

export type SessionItem = Pick<SessionSummary, "slug" | "topic" | "status" | "project" | "updated" | "open"> & {
  live: boolean;
  /** Null when unfiled. */
  mark: Mark | null;
  stage: Stage;
  /** Closed issues out of all the session's issues, when it has any. */
  progress?: { done: number; total: number };
  /** Building only: the first open issue in id order. */
  next?: Pick<Issue, "id" | "title" | "status">;
};

export type LiveItem = SessionItem & Pick<LiveSession, "working" | "connected">;

/** A row of the work lists (Home, a project's stages); `working` is set on the live ones. */
export type WorkItem = SessionItem & Partial<Pick<LiveSession, "working">>;

export type ProjectNode = {
  /** A belay key, or `UNFILED`. */
  key: string;
  name: string;
  group?: string;
  focus?: boolean;
  status?: string;
  /** Null for Unfiled. */
  mark: Mark | null;
  sessions: SessionItem[];
};

/** What the Drawer starts from for a live grill: a turn in progress and the status line's meters. */
export type DrawerSeed = { turn: OpenTurn | null; usage: Usage | null };

export type Nav = { live: LiveItem[]; seeds: Record<string, DrawerSeed> };

function mark(p: Project): Mark {
  let iconV: number | undefined;
  try {
    if (p.icon) iconV = Math.round(statSync(p.icon).mtimeMs);
  } catch {}
  return { key: p.key, name: p.name, iconV };
}

/** Each filed session's mark: the first project, in project order, that files it. */
function marks(sessions: SessionSummary[], projects: Project[], byGrill: Map<string, Issue[]>): Map<string, Mark> {
  const out = new Map<string, Mark>();
  for (const { project, tagged, byIssues, matched } of fileSessions(sessions, projects, byGrill).projects) {
    const m = mark(project);
    for (const s of [...tagged, ...byIssues, ...matched]) if (!out.has(s.slug)) out.set(s.slug, m);
  }
  return out;
}

/** What turns a session into a list item, beyond the session itself. */
type Ctx = { live: Set<string>; marks: Map<string, Mark>; byGrill: Map<string, Issue[]> };

function item(s: SessionSummary, ctx: Ctx): SessionItem {
  const issues = ctx.byGrill.get(s.slug) ?? [];
  const st = stage(s, issues);
  const out: SessionItem = {
    slug: s.slug,
    topic: s.topic,
    status: s.status,
    project: s.project,
    updated: s.updated,
    open: s.open,
    live: ctx.live.has(s.slug),
    mark: ctx.marks.get(s.slug) ?? null,
    stage: st,
  };
  if (issues.length) out.progress = { done: issues.filter(isClosed).length, total: issues.length };
  const next = issues.find((i) => !isClosed(i));
  if (st === "building" && next) out.next = { id: next.id, title: next.title, status: next.status };
  return out;
}

/**
 * The bridges that count as Live in the lists: attached, to a session still in progress. `/clear` leaves the
 * bridge running but disconnected, and a plan accepted with a clear leaves it attached to a `planned` session.
 */
function active(live: LiveSession[], sessions: SessionSummary[]) {
  const status = new Map(sessions.map((s) => [s.slug, s.status]));
  return live.filter((l) => l.connected && (status.get(l.slug) ?? "in-progress") === "in-progress");
}

const byGrill = () => issuesByGrill(belay().issues);

async function load() {
  await connection();
  const sessions = listSessions(sessionRoots(), memo()).sort(byUpdated);
  const live = active(await liveSessions(), sessions);
  const projects = projectsOf(belay());
  const issues = byGrill();
  const ctx: Ctx = { live: new Set(live.map((l) => l.slug)), marks: marks(sessions, projects, issues), byGrill: issues };
  return { live, sessions, projects, ctx };
}

function liveItems(live: LiveSession[], sessions: SessionSummary[], ctx: Ctx): LiveItem[] {
  const bySlug = new Map(sessions.map((s) => [s.slug, s]));
  return live.map((l) => {
    const s = bySlug.get(l.slug);
    const base: SessionItem = s
      ? item(s, ctx)
      : { slug: l.slug, topic: l.slug, status: "in-progress", live: true, mark: null, stage: "grilling" };
    return { ...base, working: l.working, connected: l.connected };
  });
}

function tree(sessions: SessionSummary[], projects: Project[], ctx: Ctx) {
  const filed = fileSessions(sessions, projects, ctx.byGrill);
  return {
    projects: filed.projects
      // archived projects only show while they still have sessions
      .filter((p) => p.project.status !== "archived" || p.tagged.length + p.byIssues.length + p.matched.length > 0)
      .map(({ project, tagged, byIssues, matched }) => ({
        key: project.key,
        name: project.name,
        group: project.group,
        focus: project.focus,
        status: project.status,
        mark: mark(project),
        sessions: [...tagged, ...byIssues, ...matched].sort(byUpdated).map((s) => item(s, ctx)),
      })),
    unfiled: { key: UNFILED, name: "Unfiled", mark: null, sessions: filed.unfiled.map((s) => item(s, ctx)) },
  };
}

/** What every page's chrome needs: the live tabs, and what the Drawer starts from for each. */
export async function navData(): Promise<Nav> {
  const { live, sessions, ctx } = await load();
  const items = liveItems(live, sessions, ctx);
  return { live: items, seeds: Object.fromEntries(items.map((l) => [l.slug, { turn: openTurn(l.slug), usage: usageFor(l.slug) }])) };
}

/**
 * Home: unfinished work only. Grilling sessions, live ones first, then building ones; each by `updated`. Old
 * grill sessions never grill here: most were left `in-progress`, and none can be resumed with `/sear resume`.
 */
export async function homeData(): Promise<{ grilling: WorkItem[]; building: SessionItem[] }> {
  const { live, sessions, ctx } = await load();
  const items = sessions.map((s) => item(s, ctx));
  const sear = new Set(sessions.filter((s) => s.source === "sear").map((s) => s.slug));
  return {
    grilling: [
      ...liveItems(live, sessions, ctx),
      ...items.filter((s) => s.stage === "grilling" && !s.live && sear.has(s.slug)),
    ],
    building: items.filter((s) => s.stage === "building"),
  };
}

const byStage = (sessions: WorkItem[]) =>
  Object.fromEntries(STAGES.map((st) => [st, sessions.filter((s) => s.stage === st)])) as Record<Stage, WorkItem[]>;

/**
 * One project's (or Unfiled's) sessions, all and split by stage, with which ones are tagged; null for a key
 * belay doesn't know.
 */
export async function projectData(
  key: string,
): Promise<(ProjectNode & { tagged: Set<string>; stages: Record<Stage, WorkItem[]> }) | null> {
  const { live, sessions, projects, ctx } = await load();
  const t = tree(sessions, projects, ctx);
  const working = new Map(live.map((l) => [l.slug, l.working]));
  const stages = (node: ProjectNode) =>
    byStage(node.sessions.map((s) => (working.has(s.slug) ? { ...s, working: working.get(s.slug) } : s)));
  if (key === UNFILED) return { ...t.unfiled, tagged: new Set(), stages: stages(t.unfiled) };
  const node = t.projects.find((p) => p.key === key.toUpperCase());
  if (!node) return null;
  const tagged = new Set(sessions.filter((s) => s.project === node.key).map((s) => s.slug));
  return { ...node, tagged, stages: stages(node) };
}

export type ProjectTile = Pick<ProjectNode, "key" | "name" | "group" | "mark"> & {
  focus: boolean;
  counts: Record<Stage, number>;
  /** Sessions building, or grilling in Sear: old grill sessions left `in-progress` aren't open work, as on Home. */
  open: number;
};

const tile = (p: ProjectNode, sear: Set<string>): ProjectTile => ({
  key: p.key,
  name: p.name,
  group: p.group,
  mark: p.mark,
  focus: p.focus ?? false,
  counts: Object.fromEntries(STAGES.map((st) => [st, p.sessions.filter((s) => s.stage === st).length])) as Record<
    Stage,
    number
  >,
  open: p.sessions.filter((s) => s.stage === "building" || (s.stage === "grilling" && sear.has(s.slug))).length,
});

/** The Projects page: every non-archived project in belay's order, and Unfiled. */
export async function projectsIndex(): Promise<{ projects: ProjectTile[]; unfiled: ProjectTile }> {
  const { sessions, projects, ctx } = await load();
  const t = tree(sessions, projects, ctx);
  const sear = new Set(sessions.filter((s) => s.source === "sear").map((s) => s.slug));
  return {
    projects: t.projects.filter((p) => p.status !== "archived").map((p) => tile(p, sear)),
    unfiled: tile(t.unfiled, sear),
  };
}

export type SearchIndex = {
  sessions: (Pick<SessionItem, "slug" | "topic" | "stage" | "updated"> & { project: Mark | null })[];
  projects: Mark[];
};

/** Every session (Sear and legacy grill) and non-archived project, for the jump-to palette. */
export async function searchIndex(): Promise<SearchIndex> {
  const { sessions, projects, ctx } = await load();
  return {
    sessions: sessions.map((s) => ({
      slug: s.slug,
      topic: s.topic,
      stage: stage(s, ctx.byGrill.get(s.slug) ?? []),
      updated: s.updated,
      project: ctx.marks.get(s.slug) ?? null,
    })),
    projects: projects.filter((p) => p.status !== "archived").map(mark),
  };
}

export type SessionPage = { session: SessionSummary; live: LiveItem | null; projectName?: string; mark: Mark | null };

/** One session for its page and the drill-in sidebar; null when no root has it. */
export async function sessionData(slug: string): Promise<SessionPage | null> {
  if (!isSlug(slug)) return null;
  await connection();
  const session = sessionRoots()
    .map((root) => readSession(root, slug, memo()))
    .find((s) => s != null);
  if (!session) return null;
  const live = (await liveSessions()).filter((l) => l.slug === slug);
  const projects = projectsOf(belay());
  const projectName = session.project ? projects.find((p) => p.key === session.project)?.name : undefined;
  const issues = byGrill();
  const m = marks([session], projects, issues);
  const ctx: Ctx = { live: new Set(live.map((l) => l.slug)), marks: m, byGrill: issues };
  return { session, live: liveItems(live, [session], ctx)[0] ?? null, projectName, mark: m.get(slug) ?? null };
}

export type SessionDetail = SessionPage & {
  /** Null for a legacy grill session, or a fresh one with only bridge.json. */
  doc: SessionDoc | null;
  chat: ChatEntry[];
  turn: OpenTurn | null;
  usage: Usage | null;
  /** Each mock file present, with its mtime (a cache-buster for the frames' URLs). */
  files: Partial<Record<MockFile, number>>;
  /** A legacy grill session: its markdown body, and whether it has an old preview.html. */
  legacy: { markdown: string; preview: boolean } | null;
};

/** Everything the session page renders; null when no root has the slug. */
export async function sessionDetail(slug: string): Promise<SessionDetail | null> {
  const page = await sessionData(slug);
  if (!page) return null;
  if (page.session.source === "grill") {
    const dir = path.join(grillDir(), slug);
    let markdown = "";
    try {
      markdown = parseFrontmatter(readFileSync(path.join(dir, `${slug}.md`), "utf8")).body;
    } catch {}
    return { ...page, doc: null, chat: [], turn: null, usage: null, files: {}, legacy: { markdown, preview: existsSync(path.join(dir, "preview.html")) } };
  }
  const dir = path.join(searDir(), slug);
  const files: SessionDetail["files"] = {};
  for (const name of MOCK_FILES) {
    try {
      files[name] = statSync(path.join(dir, name)).mtimeMs;
    } catch {}
  }
  return { ...page, doc: readSessionDoc(dir), chat: readChat(dir), turn: openTurn(slug), usage: usageFor(slug), files, legacy: null };
}
