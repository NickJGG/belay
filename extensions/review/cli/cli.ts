/** `belay review`, its `belay search` hits and its digest line. Decisions are written here first; the site wraps these. */
import { args, print } from '../../../src/argv.ts';
import { DEFAULT_PORT, dataDir, sessionsDir } from '../../../src/config.ts';
import { clip, plural } from '../../../src/digest.ts';
import { addIssue, commentAuthor, Ctx, oneOf } from '../../../src/ops.ts';
import { normalizeStoredPath, type Issue, type Project } from '../../../src/store.ts';
import { deleteReview, getReview, loadChecking, loadReviews, reviewFolder, updateDecisions, type SavedReview } from './reviews.ts';
import {
  campaignLabel,
  DECISIONS,
  OUTCOMES,
  reviewCounts,
  verdictText,
  withDecision,
  withOutcome,
  withTracked,
  type DecisionEntry,
  type Finding,
  type Section,
} from './state.ts';

export const reviewUrl = (id: string) => `http://127.0.0.1:${DEFAULT_PORT}/r/${id}`;

const SECTION_LABEL: Record<Section, string> = {
  critical: 'Critical',
  important: 'Important',
  unverified: 'Unverified: needs an observation',
  debt: 'Debt',
  suggested: 'Suggested',
  question: 'Questions',
  plausible: 'Plausible',
  already: 'Already there',
  refuted: 'Refuted',
};

const STATE_LABEL = { running: 'running', 'needs-you': 'needs you', done: 'done' } as const;

function localTime(iso: string): string {
  const d = new Date(iso);
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function findingNumbers(raw: string[]): number[] {
  return raw.map((s) => {
    const n = Number(s.replace(/^#/, ''));
    if (!Number.isInteger(n) || n < 1) throw new Error(`'${s}' is not a finding number`);
    return n;
  });
}

const reviewsDir = () => sessionsDir('review', dataDir());

function decisionText(d: DecisionEntry | undefined): string {
  if (!d?.decision) return d?.issue ? `(tracked ${d.issue})` : '';
  if (d.decision === 'track') return `track ${d.issue ?? ''}`.trim();
  if (d.decision === 'fix' && d.outcome) return d.outcome === 'applied' ? 'fixed' : `manual follow-up${d.note ? `: ${d.note}` : ''}`;
  return d.decision;
}

function listLines(reviews: SavedReview[]): string[] {
  const rows = reviews.map(({ review, findings, decisions }) => {
    const c = reviewCounts(review, findings, decisions);
    const target = review.ref ? `${review.target} (${review.ref})` : review.target;
    const badges = [review.campaign && `campaign · ${campaignLabel(review.campaign)}`, c.toFix && `${c.toFix} to fix`].filter(Boolean).join(' · ');
    return [review.id, STATE_LABEL[c.state], review.project ?? '-', clip(target, 50), review.status === 'running' ? '' : verdictText(findings), badges, localTime(review.started).slice(0, 10)];
  });
  const widths = rows[0].map((_, i) => Math.max(...rows.map((r) => r[i].length)));
  return rows.map((r) => r.map((cell, i) => (i === r.length - 1 ? cell : cell.padEnd(widths[i]))).join('  ').trimEnd());
}

function showLines({ review, findings, decisions }: SavedReview, checking: number): string[] {
  const c = reviewCounts(review, findings, decisions);
  const field = (k: string, v: string) => `${`${k}:`.padEnd(10)}${v}`;
  const out = [
    `${review.id}  ${STATE_LABEL[c.state]}${review.status === 'stopped' ? ' (stopped)' : ''}`,
    field('target', review.ref ? `${review.target} (${review.ref})` : review.target),
    field('project', review.project ?? '-'),
    field('repo', normalizeStoredPath(review.root)),
  ];
  if (review.tier) out.push(field('tier', [review.tier, review.mode].filter(Boolean).join(' · ')));
  if (review.campaign) out.push(field('campaign', campaignLabel(review.campaign)));
  out.push(field('started', localTime(review.started) + (review.finished ? ` – ${localTime(review.finished).slice(11)}` : '')));
  if (review.partial) out.push(field('partial', review.partial));
  out.push(field('page', reviewUrl(review.id)));
  if (review.status === 'running') {
    out.push(field('stages', review.stages.map((s) => `${s.name} ${s.of !== undefined ? `${s.done}/${s.of}` : s.status}`).join(' · ')));
    if (checking) out.push(field('checking', plural(checking, 'finding')));
    return out;
  }
  out.push(field('verdict', verdictText(findings)));
  let section: Section | undefined;
  for (const f of findings) {
    if (f.section !== section) {
      section = f.section;
      out.push('', SECTION_LABEL[section]);
    }
    out.push(findingLine(f, decisionText(decisions[f.n])));
  }
  return out;
}

function findingLine(f: Finding, decision: string): string {
  const at = f.line == null ? f.file : `${f.file}:${f.line}`;
  return `  #${String(f.n).padEnd(3)} ${(f.severity ?? '').toLowerCase().padEnd(9)}  ${clip(f.title, 80)}  ${at}${decision ? `  [${decision}]` : ''}`;
}

function trackBody(review: SavedReview['review'], f: Finding): string {
  const at = f.line == null ? f.file : `${f.file}:${f.line}`;
  return [
    `\`${at}\`, finding #${f.n} of review ${review.id} (${review.target}): ${reviewUrl(review.id)}`,
    f.impact ?? '',
    f.fix ? `Suggested fix: ${f.fix}` : '',
  ]
    .filter(Boolean)
    .join('\n\n');
}

export function cmdReview(argv: string[]): void {
  const [sub, ...rest] = argv;
  const dir = reviewsDir();
  const author = commentAuthor(process.env);
  const at = new Date().toISOString();
  switch (sub) {
    case 'list': {
      const { values } = args(rest, { project: { type: 'string' } }, 0);
      const key = values.project?.toUpperCase();
      const reviews = loadReviews(dir).filter((r) => !key || (key === 'UNFILED' ? !r.review.project : r.review.project === key));
      return print(reviews.length ? listLines(reviews) : 'no reviews');
    }
    case 'show': {
      const { values, positionals } = args(rest, { json: { type: 'boolean' } }, 1);
      const saved = getReview(dir, positionals[0]);
      if (values.json) return print(JSON.stringify({ ...saved, counts: reviewCounts(saved.review, saved.findings, saved.decisions) }, null, 2));
      return print(showLines(saved, loadChecking(dir, positionals[0]).length));
    }
    case 'decide': {
      const { positionals } = args(rest, {}, 3, Infinity);
      const [id, ...more] = positionals;
      const action = oneOf(more.pop()!, [...DECISIONS.filter((d) => d !== 'track'), 'clear'] as const, 'decision');
      const ns = findingNumbers(more);
      updateDecisions(dir, id, ns, (d) => withDecision(d, ns, action, author.by, at));
      return print(`${id}: ${ns.map((n) => `#${n}`).join(' ')} ${action === 'clear' ? 'cleared' : action}`);
    }
    case 'track': {
      const { values, positionals } = args(rest, { project: { type: 'string' } }, 2);
      const [id] = positionals;
      const [n] = findingNumbers([positionals[1]]);
      const { review, findings, decisions } = getReview(dir, id);
      const f = findings.find((x) => x.n === n);
      if (!f) throw new Error(`review '${id}' has no finding #${n}`);
      if (decisions[n]?.issue) throw new Error(`#${n} is already tracked as ${decisions[n].issue}`);
      const project = values.project ?? review.project;
      if (!project) throw new Error(`review '${id}' has no project: pass --project <key>`);
      const issue = addIssue(new Ctx(), { title: f.title, project, status: 'idea', source: 'claude', body: trackBody(review, f) }, author);
      updateDecisions(dir, id, [n], (d) => withTracked(d, n, issue.id, author.by, at));
      return print(`added ${issue.id} "${issue.title}" (idea) for ${id} #${n}`);
    }
    case 'outcome': {
      const { values, positionals } = args(rest, { note: { type: 'string' } }, 3, Infinity);
      const [id, ...more] = positionals;
      const outcome = oneOf(more.pop()!, OUTCOMES, 'outcome');
      const ns = findingNumbers(more);
      updateDecisions(dir, id, ns, (d) => withOutcome(d, ns, outcome, author.by, at, values.note));
      return print(`${id}: ${ns.map((n) => `#${n}`).join(' ')} ${outcome}`);
    }
    case 'delete': {
      const { positionals } = args(rest, {}, 1);
      deleteReview(dir, positionals[0]);
      return print(`deleted review ${positionals[0]}`);
    }
    case 'path': {
      const { positionals } = args(rest, {}, 1);
      getReview(dir, positionals[0]);
      return print(normalizeStoredPath(reviewFolder(dir, positionals[0])));
    }
    default:
      throw new Error(`unknown 'review ${sub ?? ''}' — expected list, show, decide, track, outcome, delete or path`);
  }
}

export function reviewMatches({ review }: SavedReview, words: string[]): boolean {
  const hay = `${review.id} ${review.target} ${review.ref ?? ''} ${review.project ?? ''}`.toLowerCase();
  return words.every((w) => hay.includes(w.toLowerCase()));
}

export function searchLines(words: string[], data: string): string[] {
  const dir = sessionsDir('review', data);
  const hits = loadReviews(dir).filter((r) => reviewMatches(r, words));
  return hits.length ? [`reviews (belay review show <id>; in ${normalizeStoredPath(dir)})`, ...listLines(hits).map((l) => `  ${l}`)] : [];
}

export function digestSection(project: Project, _issues: Issue[], data: string): string[] {
  return digestLines(project, loadReviews(sessionsDir('review', data)));
}

/** The project's reviews that need you, as one line, or none. */
export function digestLines(project: Project, reviews: SavedReview[]): string[] {
  const waiting = reviews.filter((r) => r.review.project === project.key && reviewCounts(r.review, r.findings, r.decisions).state === 'needs-you');
  if (!waiting.length) return [];
  const ids = waiting.slice(0, 2).map((r) => r.review.id).join(', ') + (waiting.length > 2 ? ', …' : '');
  return [`review: ${plural(waiting.length, 'review')} ${waiting.length === 1 ? 'needs' : 'need'} you (${ids}) (belay review list)`];
}
