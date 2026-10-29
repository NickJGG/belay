import "server-only";
import { statSync } from "node:fs";
import { connection } from "next/server";
import { cache } from "react";
import { dataDir } from "../../../src/config.ts";
import { EXTENSION_IDS, type ExtensionId } from "../../../src/extension-ids.ts";
import { attachedSessions, enabledExtensions } from "../../../src/extensions.ts";
import { activity, activityGrid, doingSince, inFlight, type ActivityDay, type GridDay } from "../../../src/home.ts";
import { loadLog, type DatedEntry, type LogEntry } from "../../../src/logs.ts";
import { Ctx as BelayCtx, bodyHash, logDays } from "../../../src/ops.ts";
import { linkCandidates } from "../../../src/picker.ts";
import { projectBoard, type Board } from "../../../src/query.ts";
import { sectionNeighbours, sidebarSections } from "../../../src/sidebar.ts";
import type { Issue as BelayIssue, Project as BelayProject } from "../../../src/store.ts";
import { addDays, isDay, workDay } from "../../../src/workday.ts";
import type { OpenTurn } from "./chat";
import type { Focus } from "./extensions";
import {
  claim,
  flightGroups,
  gridSources,
  issueParts,
  liveItems,
  loadKinds,
  projectEntries,
  searchParts,
  type ListedSession,
  type LiveItem,
  type SearchParts,
  type SessionItem,
} from "./extensions.server";
import { accountUsage, focusFor, liveSessions, openTurn, usageFor } from "./hub";
import { projectsOf, type Project } from "./projects";
import type { ItemContext, Mark } from "./session-kind";
import type { ExtensionState } from "./settings";
import type { FlightGroup, ProjectEntry } from "./slots";
import type { Usage } from "./usage";
import type { SessionMemo } from "./sessions";

// On globalThis so dev-mode module reloads keep the parsed sessions.
const g = globalThis as typeof globalThis & { __belayMemo?: SessionMemo };
export const sessionMemo = () => (g.__belayMemo ??= new Map());

/** Belay's data, loaded once per request. Lenient: pages render what loaded rather than failing on a bad file. */
export const belay = cache(() => new BelayCtx(dataDir(), { lenient: true }));

export type { LiveItem, Mark, SessionItem };

/** What the Drawer starts from for a live session: a turn in progress, the status line's meters, its focus (a lesson's last show). */
export type DrawerSeed = { turn: OpenTurn | null; usage: Usage | null; focus: Focus | null };

export type Nav = { live: LiveItem[]; seeds: Record<string, DrawerSeed> };

/** A project's mark, with its icon's mtime as a cache-buster. */
export function markOf(p: Project): Mark {
  let iconV: number | undefined;
  try {
    if (p.icon) iconV = Math.round(statSync(p.icon).mtimeMs);
  } catch {}
  return { key: p.key, name: p.name, iconV, color: p.color };
}

/** Each filed session's mark, from the project its kind files it under. */
export function marksOf(filed: Map<string, Project>): Map<string, Mark> {
  const byKey = new Map<string, Mark>();
  const out = new Map<string, Mark>();
  for (const [slug, p] of filed) {
    if (!byKey.has(p.key)) byKey.set(p.key, markOf(p));
    out.set(slug, byKey.get(p.key)!);
  }
  return out;
}

/**
 * The active kinds' listed sessions, and the bridges that count as Live in the lists: attached, to a session still in
 * progress. `/clear` leaves the bridge running but disconnected, and a plan accepted with a clear leaves it attached to
 * a `planned` session.
 */
export async function sessionLists() {
  await connection();
  const kinds = await loadKinds();
  const projects = projectsOf(belay());
  const issues = belay().issues;
  const rows = new Map<string, (s: ListedSession, ctx: ItemContext) => SessionItem>();
  const filed = new Map<string, Project>();
  const sessions: ListedSession[] = kinds.flatMap(({ root, runtime: { list, item, filed: fileOf } }) => {
    if (!list || !item) return [];
    // Only grills are listed so far.
    const listed = list(root, sessionMemo()) as ListedSession[];
    for (const s of listed) rows.set(s.slug, item as (s: ListedSession, ctx: ItemContext) => SessionItem);
    for (const [slug, p] of fileOf?.(listed, projects, issues) ?? []) filed.set(slug, p);
    return listed;
  });
  const all = await liveSessions();
  const claims = claim(all, kinds, sessionMemo());
  const live = all.filter((l) => l.connected && claims.has(l.slug) && (claims.get(l.slug)!.s?.status ?? "in-progress") === "in-progress");
  const ctx: ItemContext = { live: new Set(live.map((l) => l.slug)), marks: marksOf(filed), issues };
  const item = (s: ListedSession) => rows.get(s.slug)!(s, ctx);
  return { live, sessions, projects, ctx, claims, item };
}

/** What every page's chrome needs: the live tabs, and what the Drawer starts from for each. */
export async function navData(): Promise<Nav> {
  const { live, ctx, claims } = await sessionLists();
  const items = await liveItems(live, claims, ctx);
  const seed = (slug: string): DrawerSeed => ({ turn: openTurn(slug), usage: usageFor(slug), focus: focusFor(slug) });
  return { live: items, seeds: Object.fromEntries(items.map((l) => [l.slug, seed(l.slug)])) };
}

export type FlightIssue = Pick<BelayIssue, "id" | "title" | "status" | "priority"> & { mark: Mark | null };

/** Home's In flight: belay's rule for doing issues, then the active extensions' groups. */
export async function homeFlight(): Promise<{ issues: FlightIssue[]; groups: FlightGroup[] }> {
  const { live, sessions, projects, ctx } = await sessionLists();
  const c = belay();
  const today = workDay();
  // Back to the oldest doing issue's start, so each one's latest linked log entry is in range.
  const logsFrom = c.issues.filter((t) => t.status === "doing").reduce((min, t) => (doingSince(t) < min ? doingSince(t) : min), today);
  const flight = inFlight(c.projects, c.issues, c.logs(logsFrom, today), today);
  const marks = new Map(projects.map((p) => [p.key, markOf(p)]));
  const issues = flight.issues.map(({ issue }): FlightIssue => ({
    id: issue.id,
    title: issue.title,
    status: issue.status,
    priority: issue.priority,
    mark: marks.get(issue.project) ?? null,
  }));
  return { issues, groups: await flightGroups({ sessions, projects, ctx, live }) };
}

export type HomePulse = { today: string; grid: GridDay[]; usage: Usage | null };

/** Home's header: the two-week activity grid (issues done and what the extensions add), and the account's limits. */
export async function homePulse(): Promise<HomePulse> {
  await connection();
  const c = belay();
  const today = workDay();
  return { today, grid: activityGrid(c.projects, c.issues, await gridSources(), today), usage: accountUsage() };
}

export type ProjectCard = Pick<Project, "key" | "name" | "group" | "status" | "focus"> & {
  mark: Mark;
  /** Its todo and doing issues. */
  open: number;
};

/** The Projects page: every project in belay's order, and the active extensions' cards. */
export async function projectsIndex(): Promise<{ projects: ProjectCard[]; entries: ProjectEntry[] }> {
  const { live, sessions, projects, ctx } = await sessionLists();
  const open = new Map<string, number>();
  for (const i of belay().issues) if (i.status === "todo" || i.status === "doing") open.set(i.project, (open.get(i.project) ?? 0) + 1);
  return {
    projects: projects.map((p) => ({
      key: p.key,
      name: p.name,
      group: p.group,
      status: p.status,
      focus: p.focus,
      mark: markOf(p),
      open: open.get(p.key) ?? 0,
    })),
    entries: await projectEntries({ sessions, projects, ctx, live }),
  };
}

export type SearchIndex = SearchParts & {
  projects: (Mark & { status: string })[];
  issues: Pick<BelayIssue, "id" | "title" | "status" | "project">[];
};

/** The command palette's names: every non-archived project and issue, and what the active extensions add. */
export async function searchIndex(): Promise<SearchIndex> {
  const { sessions, projects, ctx } = await sessionLists();
  return {
    ...(await searchParts({ sessions, ctx })),
    projects: projects.filter((p) => p.status !== "archived").map((p) => ({ ...markOf(p), status: p.status })),
    issues: belay().issues.map(({ id, title, status, project }) => ({ id, title, status, project })),
  };
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
  return { project, mark: markOf(listed), ...sectionNeighbours(sidebarSections(c.projects), project.key) };
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
  return { today, feed: activity(c.projects, c.issues, c.logs(from, today), from, today, { project: key }) };
}

/** Home's Recent activity: issues moved to done across projects, `days` work days back, with each project's mark. */
export async function homeActivity(days: number): Promise<{ today: string; feed: ActivityDay[]; marks: Record<string, Mark> }> {
  await connection();
  const c = belay();
  const today = workDay();
  const from = addDays(today, -(days - 1));
  const marks = Object.fromEntries(projectsOf(c).map((p) => [p.key, markOf(p)]));
  return { today, feed: activity(c.projects, c.issues, [], from, today, { doneOnly: true }), marks };
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
  /** What the active extensions' issue facts and actions draw from. */
  ext: Partial<Record<ExtensionId, unknown>>;
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
    ext: await issueParts(issue, c.dir),
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

/** Settings' Extension cards: each built-in's setting, and its sessions with a bridge attached. */
export async function extensionStates(): Promise<ExtensionState[]> {
  await connection();
  const dir = dataDir();
  const enabled = enabledExtensions(dir);
  return Promise.all(EXTENSION_IDS.map(async (id) => ({ id, on: enabled[id], attached: await attachedSessions(dir, id) })));
}
