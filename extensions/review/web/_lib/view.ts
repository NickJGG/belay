/**
 * What the review pages show, worked out from a saved review: finding groups, decision chips, progress segments,
 * the list's rows and filters, the stage timeline. Pure: no fs, no `@/`, so `test/site/` runs it and client
 * components may import it.
 */
import { campaignLabel, reviewCounts, type Checking, type DecisionEntry, type Decisions, type Finding, type Review, type ReviewState, type Stage } from "../../cli/state.ts";

export type Tone = "bad" | "warn" | "quiet";

/** A finding's severity dot. */
export function severityTone(f: { severity: string | null }): Tone {
  return f.severity === "CRITICAL" ? "bad" : f.severity === "IMPORTANT" ? "warn" : "quiet";
}

const SEVERITY_WORD: Record<string, string> = { CRITICAL: "Critical", IMPORTANT: "Important", DEBT: "Debt", SUGGESTED: "Suggested", QUESTION: "Question" };

export const severityWord = (s: string | null): string => (s ? (SEVERITY_WORD[s] ?? sentence(s.toLowerCase())) : "Finding");

/** `duplicated-logic` → `Duplicated logic`. */
export const kindLabel = (kind: string): string => sentence(kind.replace(/[-_]+/g, " ").trim()) || "Other";

/** Upper-cases the first letter, unless the text starts with code (`src/`, `generate()`), which stays as written. */
export function sentence(s: string): string {
  const first = /^\S+/.exec(s)?.[0] ?? "";
  return /^[a-z][a-z']*,?$/.test(first) ? s[0].toUpperCase() + s.slice(1) : s;
}

/** A review's title: its target in sentence case. */
export const reviewTitle = (r: Pick<Review, "target">): string => sentence(r.target);

export const at = (f: Pick<Finding, "file" | "line">): string => (f.line == null ? f.file : `${f.file}:${f.line}`);

export type GroupName = "Must fix" | "Unverified" | "Quality" | "Plausible" | "Already there";

/** The page's groups in report order; refuted findings aren't shown, as the verdict doesn't count them. */
export function groups(findings: readonly Finding[]): { label: GroupName; findings: Finding[] }[] {
  const of = (label: GroupName, keep: (f: Finding) => boolean) => ({ label, findings: findings.filter(keep) });
  return [
    of("Must fix", (f) => f.must_fix),
    of("Unverified", (f) => f.section === "unverified"),
    of("Quality", (f) => !f.must_fix && (f.section === "debt" || f.section === "suggested" || f.section === "question")),
    of("Plausible", (f) => f.section === "plausible"),
    of("Already there", (f) => f.section === "already"),
  ].filter((g) => g.findings.length);
}

/** The findings the page walks through, in group order. */
export const shown = (findings: readonly Finding[]): Finding[] => groups(findings).flatMap((g) => g.findings);

export type Chip = { text: string; tone: "fix" | "done" | "skip" | "track" | "manual" };

/** A finding's decision chip in the Outline, or null while it's undecided. */
export function decisionChip(d: DecisionEntry | undefined): Chip | null {
  if (d?.decision === "fix") {
    if (d.outcome === "applied") return { text: "Fixed", tone: "done" };
    if (d.outcome === "manual") return { text: "Manual", tone: "manual" };
    return { text: "To fix", tone: "fix" };
  }
  if (d?.decision === "skip") return { text: "Skipped", tone: "skip" };
  if (d?.decision === "track" || d?.issue) return { text: d.issue ?? "Tracked", tone: "track" };
  return null;
}

export type Segment = "decided" | "track" | "open" | "now";

/** The bar's progress segments, one per shown finding: decided (fix or skip), tracked, still open, or the one open. */
export function segments(findings: readonly Finding[], decisions: Decisions, current: number | null): Segment[] {
  return shown(findings).map((f) => {
    if (f.n === current) return "now";
    const d = decisions[f.n]?.decision;
    return d === "fix" || d === "skip" ? "decided" : d === "track" ? "track" : "open";
  });
}

/** Where Walk through starts: the first must-fix finding with no decision, else the first finding. */
export function walkStart(findings: readonly Finding[], decisions: Decisions): number | null {
  const list = shown(findings);
  return (list.find((f) => f.must_fix && !decisions[f.n]?.decision) ?? list[0])?.n ?? null;
}

/** The finding before or after `n` in walk order, or null at either end. */
export function step(findings: readonly Finding[], n: number, by: 1 | -1): number | null {
  const list = shown(findings);
  const i = list.findIndex((f) => f.n === n);
  return i === -1 ? null : (list[i + by]?.n ?? null);
}

/** Bulk decisions from the dock: every must-fix finding, or every shown one. */
export const mustFixNumbers = (findings: readonly Finding[]): number[] => findings.filter((f) => f.must_fix).map((f) => f.n);
export const allNumbers = (findings: readonly Finding[]): number[] => shown(findings).map((f) => f.n);

/** Fix decisions with no outcome yet: what Apply would run. */
export const toFix = (decisions: Decisions): number =>
  Object.values(decisions).filter((d) => d.decision === "fix" && !d.outcome).length;

/** The Overview's verdict: `2 must-fix` (shown strong) and the rest, or `Nothing must be fixed`; refuted ones don't count. */
export function verdictLine(findings: readonly Finding[]): { strong?: string; rest: string } {
  const must = findings.filter((f) => f.must_fix).length;
  const more = findings.filter((f) => !f.must_fix && f.section !== "refuted").length;
  const tail = more ? ` · ${more} more` : "";
  return must ? { strong: `${must} must-fix`, rest: tail } : { rest: `Nothing must be fixed${tail}` };
}

export type RowTone = "running" | "bad" | "ok" | "stopped";

/** A Reviews row: target, verdict, badges and date, and which filter it falls under. */
export type ReviewRow = {
  id: string;
  title: string;
  ref: string | null;
  tone: RowTone;
  verdict: { strong?: string; rest: string };
  campaign: string | null;
  toFix: number;
  state: ReviewState;
  started: string;
};

/** A must-fix finding still open: no decision, or a fix not yet applied. */
const openMust = (f: Finding, decisions: Decisions) => {
  const d = decisions[f.n];
  return f.must_fix && (!d?.decision || (d.decision === "fix" && d.outcome !== "applied"));
};

export function reviewRow(review: Review, findings: readonly Finding[], decisions: Decisions): ReviewRow {
  const c = reviewCounts(review, findings, decisions);
  const more = findings.filter((f) => !f.must_fix && f.section !== "refuted").length;
  const tail = more ? ` · ${more} more` : "";
  const must = findings.filter((f) => f.must_fix);
  let verdict: ReviewRow["verdict"];
  if (review.status === "running") verdict = { rest: "Reviewing" };
  else if (review.status === "stopped") verdict = { rest: "Stopped" };
  else if (must.length && must.every((f) => decisions[f.n]?.outcome === "applied")) verdict = { rest: "Fixes applied" };
  else if (must.length) verdict = { strong: `${must.length} must-fix`, rest: tail };
  else verdict = { rest: `Clean${tail}` };
  const tone: RowTone =
    review.status === "running" ? "running" : review.status === "stopped" ? "stopped" : findings.some((f) => openMust(f, decisions)) ? "bad" : "ok";
  return {
    id: review.id,
    title: reviewTitle(review),
    ref: review.ref,
    tone,
    verdict,
    campaign: review.campaign ? `Campaign · ${campaignLabel(review.campaign)}` : null,
    toFix: c.toFix,
    state: c.state,
    started: review.started,
  };
}

export type ListFilter = "needs-you" | "done" | "all";
export const FILTERS: readonly ListFilter[] = ["needs-you", "done", "all"];
export const FILTER_LABEL: Record<ListFilter, string> = { "needs-you": "Needs you", done: "Done", all: "All" };

/** Running reviews sit under Needs you, first: they're in flight, and will need you once they finish. */
export function filterRows(rows: readonly ReviewRow[], f: ListFilter): ReviewRow[] {
  if (f === "all") return [...rows];
  if (f === "done") return rows.filter((r) => r.state === "done");
  return [...rows.filter((r) => r.state === "running"), ...rows.filter((r) => r.state === "needs-you")];
}

/** The filter a list opens on: the hash's, else Needs you while it has rows, else All. */
export function openFilter(hash: string, rows: readonly ReviewRow[]): ListFilter {
  const named = FILTERS.find((f) => `#${f}` === hash);
  if (named) return named;
  return filterRows(rows, "needs-you").length ? "needs-you" : "all";
}

/** `m:ss` (or `h:mm:ss`) between two ISO times, or from `from` to `now`; empty without a start. */
export function elapsed(from: string | null, to: string | null, now: number): string {
  if (!from) return "";
  const s = Math.max(0, Math.round(((to ? Date.parse(to) : now) - Date.parse(from)) / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = String(s % 60).padStart(2, "0");
  return h ? `${h}:${String(m).padStart(2, "0")}:${ss}` : `${m}:${ss}`;
}

const STAGE_LABEL: Record<Stage["name"], string> = { plan: "Plan", checks: "Checks", reviewers: "Reviewers", verifiers: "Verifiers", report: "Report" };

export type StageRow = { name: Stage["name"]; label: string; status: Stage["status"]; time: string; count: { done: number; of: number; pct: number } | null };

/** The running timeline: each stage, its time (so far, while doing) and its returned-of count. */
export function stageRows(stages: readonly Stage[], now: number): StageRow[] {
  return stages.map((s) => ({
    name: s.name,
    label: STAGE_LABEL[s.name],
    status: s.status,
    time: s.status === "todo" ? "" : elapsed(s.started, s.finished, now),
    count: s.of !== undefined && s.of > 0 ? { done: s.done ?? 0, of: s.of, pct: Math.round(((s.done ?? 0) / s.of) * 100) } : null,
  }));
}

/** While running: what verifiers confirmed so far, and what they're still checking. Refuted ones drop out. */
export function checkingSplit(checking: readonly Checking[]): { confirmed: Checking[]; pending: Checking[]; mustFix: number } {
  const confirmed = checking.filter((c) => c.verdict === "confirmed");
  const pending = checking.filter((c) => c.verdict == null);
  const mustFix = confirmed.filter((c) => c.severity === "CRITICAL" || c.severity === "IMPORTANT").length;
  return { confirmed, pending, mustFix };
}

/** A saved hunk (`hunks/<n>.json`): the diff lines around the finding's line. */
export type HunkLine = { kind: "+" | "-" | " "; line: number | null; text: string };
export type Hunk = { file: string; line: number; context: string; lines: HunkLine[] };

/** The new-side line range a hunk covers, which Show 20 lines above/below extends; null when it has none. */
export function hunkSpan(lines: readonly HunkLine[]): { first: number; last: number } | null {
  const nums = lines.filter((l) => l.kind !== "-" && l.line != null).map((l) => l.line!);
  return nums.length ? { first: Math.min(...nums), last: Math.max(...nums) } : null;
}

export const CONTEXT_STEP = 20;

/** The lines to read for one expander click, clamped at line 1; null when there's nothing above. */
export function expandRange(span: { first: number; last: number }, dir: "above" | "below"): { from: number; to: number } | null {
  if (dir === "below") return { from: span.last + 1, to: span.last + CONTEXT_STEP };
  if (span.first <= 1) return null;
  return { from: Math.max(1, span.first - CONTEXT_STEP), to: span.first - 1 };
}

/** The page's view, kept in the hash: the Overview or one finding. */
export type View = { kind: "overview" } | { kind: "finding"; n: number };

export function parseView(hash: string, findings: readonly Finding[]): View {
  const m = /^#f-(\d+)$/.exec(hash);
  const n = m ? Number(m[1]) : NaN;
  return findings.some((f) => f.n === n) ? { kind: "finding", n } : { kind: "overview" };
}

export const viewHash = (v: View): string => (v.kind === "overview" ? "#overview" : `#f-${v.n}`);
