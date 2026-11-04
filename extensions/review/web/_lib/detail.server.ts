import "server-only";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { connection } from "next/server";
import { belay, marksOf, type Mark } from "@/lib/data";
import { runtimeOf, sessionRoots } from "@/lib/extensions.server";
import { liveSessions } from "@/lib/hub";
import { projectsOf } from "@/lib/projects";
import { reviewCounts, type Checking, type Decisions, type Finding, type Review, type ReviewCounts } from "../../cli/state.ts";
import { isReviewId, loadChecking, loadReview } from "../../cli/reviews.ts";
import type { runtime } from "./runtime.server";
import type { Hunk } from "./view";

/** What a review's Covered fact draws from (`coverage.json`). */
export type Coverage = { files: number; skipped: unknown[]; unaccounted: unknown[]; neverReviewed: unknown[] };

export type ReviewDetail = {
  review: Review;
  findings: Finding[];
  decisions: Decisions;
  counts: ReviewCounts;
  checking: Checking[];
  hunks: Record<number, Hunk>;
  coverage: Coverage | null;
  mark: Mark | null;
  /** Its session is attached and answering. */
  connected: boolean;
  /** Its session is attached but cleared (`/clear`). */
  disconnected: boolean;
};

function readJson<T>(file: string): T | null {
  try {
    return JSON.parse(readFileSync(file, "utf8")) as T;
  } catch {
    return null;
  }
}

function hunksIn(dir: string): Record<number, Hunk> {
  const out: Record<number, Hunk> = {};
  let names: string[] = [];
  try {
    names = readdirSync(path.join(dir, "hunks"));
  } catch {
    return out;
  }
  for (const name of names) {
    const n = Number(/^(\d+)\.json$/.exec(name)?.[1]);
    const h = Number.isInteger(n) && readJson<Hunk>(path.join(dir, "hunks", name));
    if (h && Array.isArray(h.lines)) out[n] = h;
  }
  return out;
}

/** Everything a review's page renders; null when there's no such review (or it's mid-write). */
export async function reviewDetail(id: string): Promise<ReviewDetail | null> {
  if (!isReviewId(id)) return null;
  await connection();
  const root = sessionRoots().review;
  if (!root) return null;
  let saved;
  try {
    saved = loadReview(root, id);
  } catch {
    return null;
  }
  if (!saved) return null;
  const dir = path.join(root, id);
  const rt = (await runtimeOf("review")) as typeof runtime;
  const marks = marksOf(rt.filed([rt.read(root, id)!], projectsOf(belay())));
  const live = (await liveSessions()).find((l) => l.slug === id);
  let checking: Checking[] = [];
  try {
    checking = saved.review.status === "running" ? loadChecking(root, id) : [];
  } catch {}
  return {
    ...saved,
    counts: reviewCounts(saved.review, saved.findings, saved.decisions),
    checking,
    hunks: hunksIn(dir),
    coverage: readJson<Coverage>(path.join(dir, "coverage.json")),
    mark: marks.get(id) ?? null,
    connected: !!live?.connected,
    disconnected: !!live && !live.connected,
  };
}

/**
 * Lines `from`–`to` of finding `n`'s file as it is now, read from the reviewed repo for Show 20 lines above/below.
 * Only a finding with a saved hunk has any: secret files never get one.
 */
export function contextLines(id: string, n: number, from: number, to: number): { line: number; text: string }[] | null {
  const root = sessionRoots().review;
  if (!root || !isReviewId(id) || !Number.isInteger(n) || !Number.isInteger(from) || !Number.isInteger(to) || from < 1 || to < from || to - from > 200) return null;
  const saved = loadReview(root, id);
  const hunk = readJson<Hunk>(path.join(root, id, "hunks", `${n}.json`));
  if (!saved || !hunk) return null;
  const repo = path.resolve(saved.review.root);
  const file = path.resolve(repo, hunk.file);
  if (path.relative(repo, file).startsWith("..") || path.isAbsolute(path.relative(repo, file))) return null;
  let text: string;
  try {
    text = readFileSync(file, "utf8");
  } catch {
    return null;
  }
  const lines = text.split(/\r?\n/);
  return lines.slice(from - 1, to).map((t, i) => ({ line: from + i, text: t }));
}
