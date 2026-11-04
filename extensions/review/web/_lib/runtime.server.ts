/** Review's session kind on the server: its saved reviews, list rows and live Tabs. Loaded by `manifest.server.ts`. */
import type { Project } from "../../../../web/src/lib/projects.ts";
import type { ItemBase, ItemContext, KindRuntime, LiveBase } from "../../../../web/src/lib/session-kind.ts";
import { reviewHref } from "./hrefs.ts";
import { listReviews, readReview, type ReviewSession } from "./sessions.ts";
import { reviewRow, type ReviewRow } from "./view.ts";

/** `row` is null for a review attached before its first save. */
export type ReviewItem = ItemBase & { row: ReviewRow | null };

export type ReviewLive = ReviewItem & LiveBase & { kind: "review" };

function item(s: ReviewSession, ctx: ItemContext): ReviewItem {
  return {
    slug: s.slug,
    topic: s.topic,
    status: s.status,
    project: s.project,
    updated: s.updated,
    live: ctx.live.has(s.slug),
    mark: ctx.marks.get(s.slug) ?? null,
    row: s.saved ? reviewRow(s.saved.review, s.saved.findings, s.saved.decisions) : null,
  };
}

/** A review is filed under the project it was saved with, when belay knows it. */
function filed(sessions: ReviewSession[], projects: Project[]): Map<string, Project> {
  const byKey = new Map(projects.map((p) => [p.key, p]));
  const out = new Map<string, Project>();
  for (const s of sessions) {
    const p = s.project && byKey.get(s.project);
    if (p) out.set(s.slug, p);
  }
  return out;
}

export const runtime = {
  read: readReview,
  list: listReviews,
  item,
  filed,
  liveItems: async (entries, ctx) =>
    entries.map(({ l, s }) => {
      const base: ReviewItem = s ? item(s, ctx) : { slug: l.slug, topic: l.slug, status: "in-progress", live: true, mark: null, row: null };
      return { ...base, working: l.working, connected: l.connected, wt: l.wt, kind: "review" as const, href: reviewHref(l.slug) };
    }),
} satisfies KindRuntime<ReviewSession, ReviewLive, ReviewItem>;
