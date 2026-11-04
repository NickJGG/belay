/** The writes `belay review decide` and `track` make, shared with the site's actions so both go through one op. */
import { DEFAULT_PORT } from '../../../src/config.ts';
import { addIssue, Ctx, type Author } from '../../../src/ops.ts';
import type { Issue } from '../../../src/store.ts';
import { getReview, updateDecisions } from './reviews.ts';
import { withDecision, withTracked, type Decision, type Finding, type Review } from './state.ts';

export const reviewUrl = (id: string) => `http://127.0.0.1:${DEFAULT_PORT}/r/${id}`;

export function decideFindings(dir: string, id: string, ns: readonly number[], action: Exclude<Decision, 'track'> | 'clear', by: string, at: string): void {
  updateDecisions(dir, id, ns, (d) => withDecision(d, ns, action, by, at));
}

function trackBody(review: Review, f: Finding): string {
  const at = f.line == null ? f.file : `${f.file}:${f.line}`;
  return [`\`${at}\`, finding #${f.n} of review ${review.id} (${review.target}): ${reviewUrl(review.id)}`, f.impact ?? '', f.fix ? `Suggested fix: ${f.fix}` : '']
    .filter(Boolean)
    .join('\n\n');
}

/** Adds finding `n` as an idea in `project` (else the review's) and records it. Refuses one already tracked. */
export function trackFinding(dir: string, id: string, n: number, project: string | undefined, author: Author, at: string, ctx = new Ctx()): Issue {
  const { review, findings, decisions } = getReview(dir, id);
  const f = findings.find((x) => x.n === n);
  if (!f) throw new Error(`review '${id}' has no finding #${n}`);
  if (decisions[n]?.issue) throw new Error(`#${n} is already tracked as ${decisions[n].issue}`);
  const key = project ?? review.project;
  if (!key) throw new Error(`review '${id}' has no project: pass --project <key>`);
  const issue = addIssue(ctx, { title: f.title, project: key, status: 'idea', source: 'claude', body: trackBody(review, f) }, author);
  updateDecisions(dir, id, [n], (d) => withTracked(d, n, issue.id, author.by, at));
  return issue;
}
