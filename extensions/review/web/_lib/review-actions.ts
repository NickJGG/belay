"use server";
/** Review actions that touch this machine, not belay's data, so they sit outside `actions.ts`'s CLI wrappers. */
import { commandLine, openTerminal } from "@/lib/terminal";
import { dataDir, sessionsDir } from "../../../../src/config.ts";
import { isActive } from "../../../../src/extensions.ts";
import { isReviewId, loadReview } from "../../cli/reviews.ts";

/**
 * Apply on a review with no session attached: a terminal in the reviewed repo running
 * `belay claude "/review:review resume <id>"`, which applies the decisions queued on the page. `command` comes back
 * for copying when no terminal could start.
 */
export async function openReviewTerminal(id: unknown): Promise<{ started?: boolean; command?: string; dir?: string; error?: string }> {
  if (!isActive("review")) return { error: "Review is switched off." };
  if (typeof id !== "string" || !isReviewId(id)) return { error: "bad review" };
  const saved = loadReview(sessionsDir("review", dataDir()), id);
  if (!saved) return { error: `no review ${id}` };
  const dir = saved.review.root;
  const argv = ["belay", "claude", `/review:review resume ${id}`];
  // `belay` is an npm .cmd shim, which Windows Terminal can't start without a shell.
  const run = process.platform === "win32" ? ["cmd", "/k", ...argv] : argv;
  const r = await openTerminal(dir, run, commandLine(argv));
  return "command" in r ? { ...r, dir } : r;
}
