"use server";
/**
 * Review's server actions. Decide and Track wrap the ops `belay review decide|track` run (`cli/ops.ts`), as
 * `actions.ts` wraps the core's; they live here because core code may not import an extension's. Apply on a closed
 * review opens a terminal, which touches this machine rather than belay's data.
 */
import { revalidatePath } from "next/cache";
import { commandLine, openTerminal } from "@/lib/terminal";
import { dataDir, sessionsDir } from "../../../../src/config.ts";
import { isActive } from "../../../../src/extensions.ts";
import type { Author } from "../../../../src/ops.ts";
import { decideFindings, trackFinding } from "../../cli/ops.ts";
import { isReviewId, loadReview } from "../../cli/reviews.ts";
import { reviewHref } from "./hrefs";

type Result = { error?: string };

const USER: Author = { by: "user" };

const reviewsDir = () => sessionsDir("review", dataDir());

function check(id: unknown): string | Result {
  if (!isActive("review")) return { error: "Review is switched off." };
  if (typeof id !== "string" || !isReviewId(id)) return { error: "bad review" };
  return id;
}

const numbers = (ns: unknown): number[] | null =>
  Array.isArray(ns) && ns.length && ns.every((n) => Number.isInteger(n) && n > 0) ? (ns as number[]) : null;

async function run(id: string, op: () => void): Promise<Result> {
  try {
    op();
  } catch (err) {
    return { error: (err as Error).message };
  }
  revalidatePath(reviewHref(id));
  return {};
}

/** Queue Fix or Skip on findings, or clear their decisions: `belay review decide`. */
export async function decide(id: unknown, ns: unknown, action: unknown): Promise<Result> {
  const ok = check(id);
  if (typeof ok !== "string") return ok;
  const list = numbers(ns);
  if (!list) return { error: "bad finding numbers" };
  if (action !== "fix" && action !== "skip" && action !== "clear") return { error: "bad decision" };
  return run(ok, () => decideFindings(reviewsDir(), ok, list, action, USER.by, new Date().toISOString()));
}

/** Add a finding as an idea in the review's project and record it: `belay review track`. */
export async function track(id: unknown, n: unknown): Promise<Result & { issue?: string }> {
  const ok = check(id);
  if (typeof ok !== "string") return ok;
  const list = numbers([n]);
  if (!list) return { error: "bad finding number" };
  let issue: string | undefined;
  const r = await run(ok, () => {
    issue = trackFinding(reviewsDir(), ok, list[0], undefined, USER, new Date().toISOString()).id;
  });
  return r.error ? r : { issue };
}

/**
 * Apply on a review with no session attached: a terminal in the reviewed repo running
 * `belay claude "/review:review resume <id>"`, which applies the decisions queued on the page. `command` comes back
 * for copying when no terminal could start.
 */
export async function openReviewTerminal(id: unknown): Promise<{ started?: boolean; command?: string; dir?: string; error?: string }> {
  const ok = check(id);
  if (typeof ok !== "string") return ok;
  const saved = loadReview(reviewsDir(), ok);
  if (!saved) return { error: `no review ${ok}` };
  const dir = saved.review.root;
  const argv = ["belay", "claude", `/review:review resume ${ok}`];
  // `belay` is an npm .cmd shim, which Windows Terminal can't start without a shell.
  const run = process.platform === "win32" ? ["cmd", "/k", ...argv] : argv;
  const r = await openTerminal(dir, run, commandLine(argv));
  return "command" in r ? { ...r, dir } : r;
}
