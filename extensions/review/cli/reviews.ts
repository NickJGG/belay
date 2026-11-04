/**
 * Saved reviews on disk (`<reviews>/<id>/`), written by the skill's `save.mjs` and read here by the CLI and site.
 * The one file written here is `decisions.json`, re-read just before each save as the ops do.
 */
import { existsSync, readFileSync, readdirSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { writeAtomic } from '../../../src/store.ts';
import type { Checking, Decisions, Finding, Review } from './state.ts';

export const isReviewId = (s: string): boolean => /^[a-z0-9][a-z0-9-]{0,63}$/.test(s);

export function reviewFolder(dir: string, id: string): string {
  if (!isReviewId(id)) throw new Error(`'${id}' is not a review id`);
  return join(dir, id);
}

function readJson<T>(path: string, fallback: T): T {
  if (!existsSync(path)) return fallback;
  return JSON.parse(readFileSync(path, 'utf8')) as T;
}

export interface SavedReview {
  review: Review;
  findings: Finding[];
  decisions: Decisions;
}

/** A review with its findings and decisions, or undefined when there's no such review. Throws on a malformed file. */
export function loadReview(dir: string, id: string): SavedReview | undefined {
  const folder = reviewFolder(dir, id);
  if (!existsSync(join(folder, 'review.json'))) return undefined;
  return {
    review: readJson<Review>(join(folder, 'review.json'), {} as Review),
    findings: readJson<Finding[]>(join(folder, 'findings.json'), []),
    decisions: readJson<Decisions>(join(folder, 'decisions.json'), {}),
  };
}

export function getReview(dir: string, id: string): SavedReview {
  const r = loadReview(dir, id);
  if (!r) throw new Error(`no review '${id}' in ${dir}`);
  return r;
}

/** Every readable review, newest first. `campaigns/` and anything without a `review.json` are skipped. */
export function loadReviews(dir: string): SavedReview[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && isReviewId(e.name))
    .flatMap((e) => {
      try {
        return loadReview(dir, e.name) ?? [];
      } catch {
        return [];
      }
    })
    .sort((a, b) => b.review.started.localeCompare(a.review.started));
}

export function loadChecking(dir: string, id: string): Checking[] {
  return readJson<Checking[]>(join(reviewFolder(dir, id), 'checking.json'), []);
}

/** Re-reads `decisions.json`, applies `edit` and saves it. Throws on a finding number the review doesn't have. */
export function updateDecisions(dir: string, id: string, ns: readonly number[], edit: (d: Decisions) => Decisions): Decisions {
  const { findings, review } = getReview(dir, id);
  if (review.status === 'running') throw new Error(`review '${id}' is still running`);
  const known = new Set(findings.map((f) => f.n));
  const bad = ns.filter((n) => !known.has(n));
  if (bad.length) throw new Error(`review '${id}' has no finding ${bad.map((n) => `#${n}`).join(', ')}`);
  const file = join(reviewFolder(dir, id), 'decisions.json');
  const next = edit(readJson<Decisions>(file, {}));
  writeAtomic(file, `${JSON.stringify(next, null, 2)}\n`);
  return next;
}

export function deleteReview(dir: string, id: string): void {
  getReview(dir, id);
  rmSync(reviewFolder(dir, id), { recursive: true, force: true });
}
