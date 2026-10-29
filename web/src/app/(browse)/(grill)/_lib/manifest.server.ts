import { grillsDir } from "../../../../../../src/config.ts";
import { linkedPath } from "../../../../../../src/open.ts";
import type { Issue } from "../../../../../../src/store.ts";
import { stage } from "../../../../lib/issues.ts";
import type { ServerKind } from "../../../../lib/session-kind.ts";
import type { ListsContext, SearchContext, ServerSlots } from "../../../../lib/slots.ts";
import { UNFILED } from "./manifest.ts";
import type { GrillSession } from "./sessions.ts";

/** Grills claim the live sessions no other kind reads, as every session was a grill before lessons. */
export const server = {
  id: "grill",
  root: grillsDir,
  fallback: true,
  load: async () => (await import("./runtime.server.ts")).runtime,
} satisfies ServerKind;

/** What an issue's Grill and Plan facts and its Open plan show. */
export type GrillIssue = { grill?: string; plan?: string };

export const slots = {
  id: "grill",
  search: async ({ sessions, ctx }: SearchContext<GrillSession>) => ({
    sessions: sessions.map((s) => ({
      slug: s.slug,
      topic: s.topic,
      stage: stage(s, ctx.byGrill.get(s.slug) ?? []),
      updated: s.updated,
      project: ctx.marks.get(s.slug) ?? null,
    })),
  }),
  flight: async (c: ListsContext<GrillSession>) => (await import("../_components/in-flight.tsx")).grillFlight(c),
  projects: async (c: ListsContext<GrillSession>) => {
    const n = (await import("./projects.server.ts")).unfiledCount(c);
    return n > 0 ? [{ key: UNFILED, name: "Unfiled", facts: n === 1 ? "1 grill" : `${n} grills` }] : [];
  },
  sections: { grills: async () => (await import("../_components/project-grills.tsx")).ProjectGrills },
  issue: async (issue: Issue, data: string): Promise<GrillIssue> => ({ grill: issue.grill, plan: linkedPath(issue, "plan", { data }) }),
} satisfies ServerSlots;

export type GrillSearch = Awaited<ReturnType<typeof slots.search>>;
