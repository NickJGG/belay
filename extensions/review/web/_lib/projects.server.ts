import "server-only";
import { sessionLists } from "@/lib/data";
import type { LiveSession } from "@/lib/hub";
import type { ListsContext } from "@/lib/slots";
import { UNFILED } from "./manifest";
import type { ReviewItem } from "./runtime.server";
import type { ReviewSession } from "./sessions";
import { reviewRow, type ReviewRow } from "./view";

/** A Reviews row; `live` and `working` are set while its session is attached. */
export type ListRow = ReviewRow & Partial<Pick<LiveSession, "working">> & { live: boolean };

const rowOf = (s: ReviewItem, working: Map<string, boolean>): ListRow[] =>
  s.row ? [{ ...s.row, live: s.live, ...(working.has(s.slug) && { working: working.get(s.slug) }) }] : [];

/** A project's reviews (or Unfiled's), newest first. */
export async function projectReviews(key: string): Promise<ListRow[]> {
  const { live, own, ctx, item } = await sessionLists();
  const working = new Map(live.map((l) => [l.slug, l.working]));
  const sessions = (own.get("review") ?? []) as ReviewSession[];
  const mine = sessions.filter((s) => (key === UNFILED ? !ctx.marks.has(s.slug) : ctx.marks.get(s.slug)?.key === key.toUpperCase()));
  return mine.flatMap((s) => rowOf(item(s) as ReviewItem, working));
}

export type FlightReview = ListRow & { mark: ReviewItem["mark"] };

/** In flight's reviews: the live ones, then the rest that need you or are running, newest first. */
export function flight({ live, sessions, ctx }: ListsContext<ReviewSession>): FlightReview[] {
  const working = new Map(live.map((l) => [l.slug, l.working]));
  const rows = sessions.flatMap((s): FlightReview[] =>
    s.saved
      ? [{ ...reviewRow(s.saved.review, s.saved.findings, s.saved.decisions), live: working.has(s.slug), working: working.get(s.slug), mark: ctx.marks.get(s.slug) ?? null }]
      : [],
  );
  return [...rows.filter((r) => r.live), ...rows.filter((r) => !r.live && r.state !== "done")];
}
