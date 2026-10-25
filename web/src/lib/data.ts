import "server-only";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { connection } from "next/server";
import { cache } from "react";
import { dataDir } from "../../../src/config.ts";
import { activity, doingSince, inFlight, type ActivityDay } from "../../../src/home.ts";
import { loadLog, type DatedEntry, type LogEntry } from "../../../src/logs.ts";
import { linkedPath } from "../../../src/open.ts";
import { Ctx as BelayCtx, bodyHash, logDays } from "../../../src/ops.ts";
import { linkCandidates } from "../../../src/picker.ts";
import { projectBoard, type Board } from "../../../src/query.ts";
import { sectionNeighbours, sidebarSections } from "../../../src/sidebar.ts";
import type { Issue as BelayIssue, Project as BelayProject } from "../../../src/store.ts";
import { addDays, isDay, workDay } from "../../../src/workday.ts";
import type { ChatEntry, OpenTurn } from "./chat";
import { courseIndex, type CourseIndex } from "./course-data";
import { grillsDir, lessonsDir } from "./config";
import { parseFrontmatter } from "./frontmatter";
import { flightGrills, type FlightRow } from "./belay-view";
import { isClosed, issuesByGrill, stage, STAGES, type Issue, type Stage } from "./issues";
import { grillHref, UNFILED } from "./hrefs";
import { MOCK_FILES, type MockFile } from "./mock";
import type { SessionDoc } from "./session-doc";
import { readChat, readSessionDoc } from "./session-files";
import { focusFor, liveSessions, openTurn, usageFor, type LiveSession } from "./hub";
import { lessonHref, type LessonShow } from "./lesson";
import { fileSessions, projectsOf, type Project } from "./projects";
import type { Usage } from "./usage";
import { byUpdated, isSlug, listSessions, readSession, type SessionMemo, type SessionSummary } from "./sessions";

// On globalThis so dev-mode module reloads keep the parsed sessions.
const g = globalThis as typeof globalThis & { __belayMemo?: SessionMemo };
const memo = () => (g.__belayMemo ??= new Map());

/** Belay's data, loaded once per request. Lenient: pages render what loaded rather than failing on a bad file. */
export const belay = cache(() => new BelayCtx(dataDir(), { lenient: true }));

export { UNFILED };

/**
 * The project a session is filed under, for its marker; `iconV` (the icon's mtime) is set when it has an icon, and
 * `color` when belay gives it one.
 */
export type Mark = { key: string; name: string; iconV?: number; color?: string };

export type SessionItem = Pick<SessionSummary, "slug" | "topic" | "status" | "project" | "updated" | "open"> & {
  live: boolean;
  /** Null when unfiled. */
  mark: Mark | null;
  stage: Stage;
  /** Closed issues out of all the session's issues, when it has any. */
  progress?: { done: number; total: number };
  /** Building only: the first open issue in id order. */
  next?: Pick<Issue, "id" | "title" | "status">;
  /** How many questions it asked; unset without a session.json. */
  questions?: number;
};

/** A live Tab: a grill, or a lesson (with its `course`). `href` is the page its Tab opens. */
export type LiveItem = SessionItem &
  Pick<LiveSession, "working" | "connected"> & { kind: "grill" | "lesson"; course?: string; href: string };

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

/** What the Drawer starts from for a live session: a turn in progress, the status line's meters, a lesson's last show. */
export type DrawerSeed = { turn: OpenTurn | null; usage: Usage | null; focus: LessonShow | null };

export type Nav = { live: LiveItem[]; seeds: Record<string, DrawerSeed> };

function mark(p: Project): Mark {
  let iconV: number | undefined;
  try {
    if (p.icon) iconV = Math.round(statSync(p.icon).mtimeMs);
  } catch {}
  return { key: p.key, name: p.name, iconV, color: p.color };
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
    questions: s.questions?.length,
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
function active(live: LiveSession[], sessions: SessionSummary[], lessons: Map<string, SessionSummary>) {
  const status = new Map(sessions.map((s) => [s.slug, s.status]));
  for (const [slug, s] of lessons) status.set(slug, s.status);
  return live.filter((l) => l.connected && (status.get(l.slug) ?? "in-progress") === "in-progress");
}

/** The live lessons' folders, which the grill lists leave out. */
function liveLessons(live: LiveSession[]): Map<string, SessionSummary> {
  const out = new Map<string, SessionSummary>();
  for (const l of live) {
    const s = readSession(lessonsDir(), l.slug, memo());
    if (s?.kind === "lesson" && s.course) out.set(l.slug, s);
  }
  return out;
}

const byGrill = () => issuesByGrill(belay().issues);

async function load() {
  await connection();
  const sessions = listSessions(grillsDir(), memo()).sort(byUpdated);
  const all = await liveSessions();
  const lessons = liveLessons(all);
  const live = active(all, sessions, lessons);
  const projects = projectsOf(belay());
  const issues = byGrill();
  const ctx: Ctx = { live: new Set(live.map((l) => l.slug)), marks: marks(sessions, projects, issues), byGrill: issues };
  return { live, sessions, projects, ctx, lessons };
}

function liveItems(live: LiveSession[], sessions: SessionSummary[], ctx: Ctx, lessons = new Map<string, SessionSummary>()): LiveItem[] {
  const bySlug = new Map(sessions.map((s) => [s.slug, s]));
  return live.map((l) => {
    const state = { working: l.working, connected: l.connected };
    const lesson = lessons.get(l.slug);
    if (lesson?.course) {
      const base: SessionItem = { slug: l.slug, topic: lesson.topic, status: lesson.status, live: true, mark: null, stage: "grilling" };
      return { ...base, ...state, kind: "lesson", course: lesson.course, href: lessonHref(lesson.course) };
    }
    const s = bySlug.get(l.slug);
    const base: SessionItem = s
      ? item(s, ctx)
      : { slug: l.slug, topic: l.slug, status: "in-progress", live: true, mark: null, stage: "grilling" };
    return { ...base, ...state, kind: "grill", href: grillHref(l.slug) };
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
  const { live, sessions, ctx, lessons } = await load();
  const items = liveItems(live, sessions, ctx, lessons);
  const seed = (slug: string): DrawerSeed => ({ turn: openTurn(slug), usage: usageFor(slug), focus: focusFor(slug) });
  return { live: items, seeds: Object.fromEntries(items.map((l) => [l.slug, seed(l.slug)])) };
}

export type HomeRow = FlightRow & { mark: Mark | null };

/**
 * Home's In flight: belay's rule, doing issues then grills no issue links to yet, with live grills first.
 * Legacy grills never count: most were left `in-progress`, and none can be resumed with `/grill resume`.
 */
export async function homeFlight(): Promise<HomeRow[]> {
  const { live, sessions, projects, ctx } = await load();
  const c = belay();
  const today = workDay();
  // Back to the oldest doing issue's start, so each one's latest linked log entry is in range.
  const logsFrom = c.issues.filter((t) => t.status === "doing").reduce((min, t) => (doingSince(t) < min ? doingSince(t) : min), today);
  const flight = inFlight(c.projects, c.issues, c.logs(logsFrom, today), sessions.filter((s) => !s.legacy), today);
  const marks = new Map(projects.map((p) => [p.key, mark(p)]));
  const bySlug = new Map(sessions.map((s) => [s.slug, s]));
  const working = new Map(live.map((l) => [l.slug, l.working]));
  const grills = flightGrills(
    flight.grill,
    live.flatMap((l) => bySlug.get(l.slug) ?? []),
  ).map((g): HomeRow => {
    const s = bySlug.get(g.slug)!;
    return {
      kind: "grill",
      slug: s.slug,
      topic: s.topic,
      live: working.has(s.slug),
      working: working.get(s.slug),
      openQ: s.questions?.find((q) => q.status === "open")?.n,
      questions: s.questions?.length,
      mark: ctx.marks.get(s.slug) ?? null,
    };
  });
  return [
    ...flight.issues.map(({ issue, idleDays }): HomeRow => ({
      kind: "issue",
      id: issue.id,
      title: issue.title,
      project: issue.project,
      idleDays,
      mark: marks.get(issue.project) ?? null,
    })),
    ...grills,
  ];
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

export type ProjectCard = Pick<Project, "key" | "name" | "group" | "status" | "focus"> & {
  mark: Mark;
  /** Its todo and doing issues. */
  open: number;
};

/** The Projects page: every project in belay's order, and how many grills nothing files. */
export async function projectsIndex(): Promise<{ projects: ProjectCard[]; unfiled: number }> {
  const { sessions, projects, ctx } = await load();
  const open = new Map<string, number>();
  for (const i of belay().issues) if (i.status === "todo" || i.status === "doing") open.set(i.project, (open.get(i.project) ?? 0) + 1);
  return {
    projects: projects.map((p) => ({
      key: p.key,
      name: p.name,
      group: p.group,
      status: p.status,
      focus: p.focus,
      mark: mark(p),
      open: open.get(p.key) ?? 0,
    })),
    unfiled: fileSessions(sessions, projects, ctx.byGrill).unfiled.length,
  };
}

export type SearchIndex = CourseIndex & {
  sessions: (Pick<SessionItem, "slug" | "topic" | "stage" | "updated"> & { project: Mark | null })[];
  projects: (Mark & { status: string })[];
  issues: Pick<BelayIssue, "id" | "title" | "status" | "project">[];
};

/**
 * The command palette's names: every grill (legacy ones too), non-archived project and issue, and every
 * course with its lessons, notes, sources and misconceptions.
 */
export async function searchIndex(): Promise<SearchIndex> {
  const [{ sessions, projects, ctx }, courses] = await Promise.all([load(), courseIndex()]);
  return {
    ...courses,
    sessions: sessions.map((s) => ({
      slug: s.slug,
      topic: s.topic,
      stage: stage(s, ctx.byGrill.get(s.slug) ?? []),
      updated: s.updated,
      project: ctx.marks.get(s.slug) ?? null,
    })),
    projects: projects.filter((p) => p.status !== "archived").map((p) => ({ ...mark(p), status: p.status })),
    issues: belay().issues.map(({ id, title, status, project }) => ({ id, title, status, project })),
  };
}

export type SessionPage = { session: SessionSummary; live: LiveItem | null; projectName?: string; mark: Mark | null };

/** One grill for its page and the drill-in sidebar; null when there's none. */
export async function sessionData(slug: string): Promise<SessionPage | null> {
  if (!isSlug(slug)) return null;
  await connection();
  const session = readSession(grillsDir(), slug, memo());
  if (!session || session.kind === "lesson") return null;
  const live = (await liveSessions()).filter((l) => l.slug === slug);
  const projects = projectsOf(belay());
  const projectName = session.project ? projects.find((p) => p.key === session.project)?.name : undefined;
  const issues = byGrill();
  const m = marks([session], projects, issues);
  const ctx: Ctx = { live: new Set(live.map((l) => l.slug)), marks: m, byGrill: issues };
  return { session, live: liveItems(live, [session], ctx)[0] ?? null, projectName, mark: m.get(slug) ?? null };
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
  if (!page) return null;
  const dir = path.join(grillsDir(), slug);
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
  return { ...page, doc: readSessionDoc(dir), chat: readChat(dir), turn: openTurn(slug), usage: usageFor(slug), files, legacy: null };
}

/** An issue as a chip or picker option shows it; `status` is unset when the id names no issue. */
export type Ref = Pick<BelayIssue, "id"> & Partial<Pick<BelayIssue, "title" | "status" | "project">>;

const ref = (c: BelayCtx, id: string): Ref => {
  const t = c.byId.get(id);
  return t ? { id: t.id, title: t.title, status: t.status, project: t.project } : { id };
};

/** Issues a blocker or a log entry may point at: idea, todo and doing. */
const openRefs = (c: BelayCtx, except?: string): Ref[] =>
  c.issues.filter((t) => t.id !== except && (t.status === "idea" || t.status === "todo" || t.status === "doing")).map((t) => ref(c, t.id));

export type ProjectHead = {
  project: BelayProject;
  mark: Mark;
  /** Its neighbours within its sidebar section, for ⋯'s Move up and Move down. */
  prev?: string;
  next?: string;
};

/** A project's header; null for a key belay doesn't know. */
export async function projectHead(key: string): Promise<ProjectHead | null> {
  await connection();
  const c = belay();
  const project = c.projects.find((p) => p.key === key.toUpperCase());
  if (!project) return null;
  const listed = projectsOf(c).find((p) => p.key === project.key)!;
  return { project, mark: mark(listed), ...sectionNeighbours(sidebarSections(c.projects), project.key) };
}

/** A project's Issues section: its board, with every done issue when `older`, and open issues for a new one's blockers. */
export async function projectIssues(key: string, older: boolean): Promise<{ board: Board; candidates: Ref[] }> {
  await connection();
  const c = belay();
  return { board: projectBoard(key, c.issues, { today: workDay(), older }), candidates: openRefs(c) };
}

/** A project's Activity section: `days` work days back from today, newest first. */
export async function projectActivity(key: string, days: number): Promise<{ today: string; feed: ActivityDay[] }> {
  await connection();
  const c = belay();
  const today = workDay();
  const from = addDays(today, -(days - 1));
  return { today, feed: activity(c.projects, c.issues, c.logs(from, today), from, today, key) };
}

const LOG_WINDOW_DAYS = 28;

/** A project's Logs section: its entries newest first, the last four weeks unless `all`, and how many are older. */
export async function projectLogs(key: string, all: boolean): Promise<{ today: string; entries: DatedEntry[]; older: number }> {
  await connection();
  const c = belay();
  const today = workDay();
  const mine = c.logs("0000-01-01", today).filter((e) => e.project === key).toReversed();
  const shown = all ? mine : mine.filter((e) => e.day > addDays(today, -LOG_WINDOW_DAYS));
  return { today, entries: shown, older: mine.length - shown.length };
}

export type IssueDetail = {
  issue: BelayIssue;
  project?: BelayProject;
  blockers: Ref[];
  /** Issues it blocks. */
  blocks: Ref[];
  candidates: Ref[];
  hash: string;
  plan?: string;
};

/** Everything the issue page shows; null for an id belay doesn't know. */
export async function issueDetail(id: string): Promise<IssueDetail | null> {
  await connection();
  const c = belay();
  const issue = c.byId.get(id.toUpperCase());
  if (!issue) return null;
  return {
    issue,
    project: c.projects.find((p) => p.key === issue.project),
    blockers: issue.blocked_by.map((b) => ref(c, b)),
    blocks: c.issues.filter((t) => t.blocked_by.includes(issue.id)).map((t) => ref(c, t.id)),
    candidates: openRefs(c, issue.id),
    hash: bodyHash(issue.body),
    plan: linkedPath(issue, "plan", { data: c.dir, grills: grillsDir(c.dir) }),
  };
}

export type LogDetail = {
  day: string;
  n: number;
  entry: LogEntry;
  project?: BelayProject;
  issue?: Ref;
  /** Days it may move to, `day` first; empty once its day is past the backdate window. */
  days: string[];
  today: string;
  candidates: Ref[];
};

/**
 * The log entry at `<day>/<n>`; `gone` (with the project it was in, when the file still holds it) when `at` names
 * an entry that has moved or been deleted, null for an address that never held one.
 */
export async function logDetail(day: string, n: number, at: string | undefined): Promise<LogDetail | { gone: true; project?: string } | null> {
  await connection();
  if (!isDay(day) || !Number.isInteger(n) || n < 1) return null;
  const c = belay();
  const entries = loadLog(c.dir, day);
  const entry = entries[n - 1];
  if (at !== undefined && entry?.at !== at) return { gone: true, project: entries.find((e) => e.at === at)?.project };
  if (!entry) return null;
  const today = workDay();
  const days = logDays(today);
  return {
    day,
    n,
    entry,
    project: c.projects.find((p) => p.key === entry.project),
    issue: entry.issue ? ref(c, entry.issue) : undefined,
    days: days.includes(day) ? days : [],
    today,
    candidates: linkCandidates(c.issues, entry.project, entry.issue).map((t) => ref(c, t.id)),
  };
}
