/**
 * Saved reviews' shapes (`plugin/references/formats.md`, "Saved review") and the pure rules over them: what still
 * needs you, the verdict line, and the decision edits `belay review` writes. No fs, so the site reuses it.
 */

export type Severity = 'CRITICAL' | 'IMPORTANT' | 'DEBT' | 'SUGGESTED' | 'QUESTION';
export type Section = 'critical' | 'important' | 'unverified' | 'debt' | 'suggested' | 'question' | 'plausible' | 'already' | 'refuted';
export type StageName = 'plan' | 'checks' | 'reviewers' | 'verifiers' | 'report';

export interface Stage {
  name: StageName;
  status: 'todo' | 'doing' | 'done';
  started: string | null;
  finished: string | null;
  /** Reviewers or verifiers returned so far, of how many. */
  done?: number;
  of?: number;
}

export interface Review {
  id: string;
  project: string | null;
  /** The reviewed repo's root. */
  root: string;
  /** As the user gave it: `last commit`, `PR #12`, `snapshot src/`. */
  target: string;
  ref: string | null;
  mode: 'diff' | 'snapshot' | null;
  tier: 'small' | 'medium' | 'large' | null;
  seed: number | null;
  preview: Record<string, number> | null;
  started: string;
  finished: string | null;
  status: 'running' | 'done' | 'stopped';
  /** What did not complete, when the report opened with PARTIAL REVIEW. */
  partial: string | null;
  /** A campaign unit's number, or its cross-module step or final rollup. */
  campaign: { unit: number | 'cross-module' | 'rollup'; of: number } | null;
  stages: Stage[];
}

export interface Finding {
  /** The report's number, shared by the page and typed commands. */
  n: number;
  section: Section;
  must_fix: boolean;
  severity: Severity | null;
  kind: string;
  key: string;
  title: string;
  file: string;
  line: number | null;
  sites: string[];
  impact: string | null;
  fix: string | null;
  trigger: string | null;
  evidence: string | null;
  rule: { source: string; quote: string } | null;
  confidence: string | null;
  claim_class: string | null;
  pre_existing: 'no' | 'reached' | 'noticed';
  needs_observation: string | null;
  found_by: string[];
  passes: number[];
  verdict: 'confirmed' | 'plausible' | 'refuted' | 'unverified';
  reason: string | null;
}

/** A finding still being verified while the review runs (`checking.json`). */
export interface Checking {
  key: string;
  title: string;
  file: string;
  line: number | null;
  severity: string | null;
  /** Null until its verifier returns. */
  verdict: string | null;
}

export type Decision = 'fix' | 'skip' | 'track';
export const DECISIONS: readonly Decision[] = ['fix', 'skip', 'track'];
export type Outcome = 'applied' | 'manual';
export const OUTCOMES: readonly Outcome[] = ['applied', 'manual'];

export interface DecisionEntry {
  decision?: Decision;
  /** The Belay idea a Track made; kept when the decision is cleared, so a second Track doesn't duplicate it. */
  issue?: string;
  /** Set once a fix ran: applied, or left as manual follow-up with `note` saying why. */
  outcome?: Outcome;
  note?: string;
  at: string;
  by: string;
}

/** Keyed by finding number. */
export type Decisions = Record<string, DecisionEntry>;

export type ReviewState = 'running' | 'needs-you' | 'done';

export interface ReviewCounts {
  state: ReviewState;
  mustFix: number;
  /** Must-fix findings with no decision. */
  undecided: number;
  /** Fix decisions not yet applied. */
  toFix: number;
}

/** Needs you: must-fix findings still undecided, or fixes not yet applied. Everything finished otherwise is done. */
export function reviewCounts(review: Pick<Review, 'status'>, findings: readonly Finding[], decisions: Decisions): ReviewCounts {
  const must = findings.filter((f) => f.must_fix);
  const undecided = must.filter((f) => !decisions[f.n]?.decision).length;
  const toFix = findings.filter((f) => decisions[f.n]?.decision === 'fix' && !decisions[f.n].outcome).length;
  const state = review.status === 'running' ? 'running' : undecided || toFix ? 'needs-you' : 'done';
  return { state, mustFix: must.length, undecided, toFix };
}

/** `2 must-fix · 9 more` or `Nothing must be fixed · 9 more`; refuted findings aren't counted. */
export function verdictText(findings: readonly Finding[]): string {
  const must = findings.filter((f) => f.must_fix).length;
  const more = findings.filter((f) => !f.must_fix && f.section !== 'refuted').length;
  return `${must ? `${must} must-fix` : 'Nothing must be fixed'}${more ? ` · ${more} more` : ''}`;
}

function withoutOutcome(e: DecisionEntry | undefined): Partial<DecisionEntry> {
  const out: Partial<DecisionEntry> = { ...e };
  delete out.outcome;
  delete out.note;
  return out;
}

const entry = (prev: Partial<DecisionEntry> | undefined, patch: Partial<DecisionEntry>, by: string, at: string): DecisionEntry => ({ ...prev, ...patch, at, by });

/** Fix, Skip or clear findings `ns`. A new decision drops an earlier outcome; clear keeps only a tracked issue. */
export function withDecision(decisions: Decisions, ns: readonly number[], action: Decision | 'clear', by: string, at: string): Decisions {
  const out = { ...decisions };
  for (const n of ns) {
    const prev = out[n];
    if (action === 'clear') {
      if (prev?.issue) out[n] = { issue: prev.issue, at, by };
      else delete out[n];
    } else {
      out[n] = entry(withoutOutcome(prev), { decision: action }, by, at);
    }
  }
  return out;
}

export function withTracked(decisions: Decisions, n: number, issue: string, by: string, at: string): Decisions {
  return { ...decisions, [n]: entry(decisions[n], { decision: 'track', issue }, by, at) };
}

/** Records how queued or typed fixes went. A finding fixed without a queued decision gets one. */
export function withOutcome(decisions: Decisions, ns: readonly number[], outcome: Outcome, by: string, at: string, note?: string): Decisions {
  const out = { ...decisions };
  for (const n of ns) {
    out[n] = entry(withoutOutcome(out[n]), { decision: 'fix', outcome, ...(note && { note }) }, by, at);
  }
  return out;
}

/** `4 of 12`, `cross-module` or `rollup`. */
export const campaignLabel = (c: NonNullable<Review['campaign']>): string => (typeof c.unit === 'number' ? `${c.unit} of ${c.of}` : c.unit);
