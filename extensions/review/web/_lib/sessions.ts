/** Saved reviews as the site's sessions: a review folder's `review.json`, or a bare `bridge.json` while attaching. */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { isReviewId, loadReview, loadReviews, type SavedReview } from "../../cli/reviews.ts";
import type { SessionBase } from "../../../../web/src/lib/sessions.ts";
import { reviewTitle } from "./view.ts";

/** `saved` is null for a folder with only `bridge.json`. */
export type ReviewSession = SessionBase & { saved: SavedReview | null };

/**
 * A stopped review is no longer in progress, so its bridge doesn't count as a live Tab; a finished one stays in
 * progress, since its session is still there to apply fixes.
 */
function session(saved: SavedReview): ReviewSession {
  const { review } = saved;
  return {
    slug: review.id,
    topic: reviewTitle(review),
    status: review.status === "stopped" ? "stopped" : "in-progress",
    project: review.project ?? undefined,
    started: review.started,
    updated: review.finished ?? review.started,
    saved,
  };
}

/** One review under `root`, or null when the folder isn't one (`campaigns/`) or doesn't parse yet. */
export function readReview(root: string, id: string): ReviewSession | null {
  if (!isReviewId(id)) return null;
  try {
    const saved = loadReview(root, id);
    if (saved) return session(saved);
  } catch {
    return null;
  }
  return existsSync(join(root, id, "bridge.json")) ? { slug: id, topic: id, status: "in-progress", saved: null } : null;
}

/** Every readable review, newest first. */
export const listReviews = (root: string): ReviewSession[] => loadReviews(root).map(session);
