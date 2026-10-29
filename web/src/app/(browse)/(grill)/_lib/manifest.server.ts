import { grillsDir } from "../../../../../../src/config.ts";
import { stage } from "../../../../lib/issues.ts";
import type { ServerKind } from "../../../../lib/session-kind.ts";
import type { SearchContext, ServerSlots } from "../../../../lib/slots.ts";
import type { GrillSession } from "./sessions.ts";

/** Grills claim the live sessions no other kind reads, as every session was a grill before lessons. */
export const server = {
  id: "grill",
  root: grillsDir,
  fallback: true,
  load: async () => (await import("./runtime.server.ts")).runtime,
} satisfies ServerKind;

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
} satisfies ServerSlots;

export type GrillSearch = Awaited<ReturnType<typeof slots.search>>;
