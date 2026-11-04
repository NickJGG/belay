import { sessionsDir } from "../../../../src/config.ts";
import type { ServerKind } from "../../../../web/src/lib/session-kind.ts";
import type { ListsContext, SearchContext, ServerSlots } from "../../../../web/src/lib/slots.ts";
import { UNFILED } from "./manifest.ts";
import type { ReviewSession } from "./sessions.ts";
import { reviewRow } from "./view.ts";

export const server = {
  id: "review",
  root: (data) => sessionsDir("review", data),
  load: async () => (await import("./runtime.server.ts")).runtime,
} satisfies ServerKind;

export const slots = {
  id: "review",
  search: async ({ sessions, ctx }: SearchContext<ReviewSession>) => ({
    reviews: sessions.flatMap((s) =>
      s.saved ? [{ id: s.slug, title: s.topic, ref: s.saved.review.ref, state: reviewRow(s.saved.review, s.saved.findings, s.saved.decisions).state, project: ctx.marks.get(s.slug) ?? null }] : [],
    ),
  }),
  flight: async (c: ListsContext<ReviewSession>) => (await import("../_components/in-flight.tsx")).reviewFlight(c),
  projects: async ({ sessions, ctx }: ListsContext<ReviewSession>) => {
    const n = sessions.filter((s) => !ctx.marks.has(s.slug)).length;
    return n > 0 ? [{ key: UNFILED, name: "Unfiled", facts: n === 1 ? "1 review" : `${n} reviews` }] : [];
  },
  sections: { reviews: async () => (await import("../_components/project-reviews.tsx")).ProjectReviews },
} satisfies ServerSlots;

export type ReviewSearch = Awaited<ReturnType<typeof slots.search>>;
