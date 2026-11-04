import "server-only";
import { belay, sessionLists } from "@/lib/data";
import type { LiveSession } from "@/lib/hub";
import { byUpdated } from "@/lib/sessions";
import type { ListsContext } from "@/lib/slots";
import { fileSessions } from "./filing";
import { flightGrills, unlinkedGrills } from "./flight";
import { byGrillOf, STAGES, type Stage } from "./issues";
import { UNFILED } from "./manifest";
import type { GrillItem } from "./runtime.server";
import type { GrillSession } from "./sessions";

/** A row of a project's Grills or In flight; `working` is set on the live ones. */
export type WorkItem = GrillItem & Partial<Pick<LiveSession, "working">>;

/** A project's grills (or Unfiled's) by stage. An archived project shows only while it still has some. */
export async function projectStages(key: string): Promise<Record<Stage, WorkItem[]>> {
  const { live, own, projects, ctx, item } = await sessionLists();
  const sessions = (own.get("grill") ?? []) as GrillSession[];
  const filed = fileSessions(sessions, projects, byGrillOf(ctx.issues));
  const node = filed.projects.find((p) => p.project.key === key.toUpperCase());
  const mine = key === UNFILED ? filed.unfiled : node ? [...node.tagged, ...node.byIssues, ...node.matched].sort(byUpdated) : [];
  const working = new Map(live.map((l) => [l.slug, l.working]));
  const rows = (mine.map(item) as GrillItem[]).map((s): WorkItem => (working.has(s.slug) ? { ...s, working: working.get(s.slug) } : s));
  return Object.fromEntries(STAGES.map((st) => [st, rows.filter((s) => s.stage === st)])) as Record<Stage, WorkItem[]>;
}

export type FlightGrill = Pick<WorkItem, "slug" | "topic" | "updated" | "live" | "working" | "mark">;

/** In flight's grills: the live ones first, then those in flight. */
export function flight({ live, sessions, ctx }: ListsContext<GrillSession>): FlightGrill[] {
  const bySlug = new Map(sessions.map((s) => [s.slug, s]));
  const working = new Map(live.map((l) => [l.slug, l.working]));
  return flightGrills(
    unlinkedGrills(belay().issues, sessions),
    live.flatMap((l) => bySlug.get(l.slug) ?? []),
  ).map((s) => ({
    slug: s.slug,
    topic: s.topic,
    updated: s.updated,
    live: working.has(s.slug),
    working: working.get(s.slug),
    mark: ctx.marks.get(s.slug) ?? null,
  }));
}

/** How many grills no project files, for Unfiled's card. */
export const unfiledCount = ({ sessions, projects, ctx }: ListsContext<GrillSession>) => fileSessions(sessions, projects, byGrillOf(ctx.issues)).unfiled.length;
