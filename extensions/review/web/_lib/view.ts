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

/** Every finding the page lists, refuted ones left out, in group order. */
const listed = (findings: readonly Finding[]): Finding[] => groups(findings).flatMap((g) => g.findings);

export type Status = "undecided" | "manual" | "fix" | "fixed" | "skip" | "track";

/** Where a finding stands: a fix queued, applied or left manual, skipped, tracked (a Track or its issue), or undecided. */
export function statusOf(d: DecisionEntry | undefined): Status {
  if (d?.decision === "fix") return d.outcome === "applied" ? "fixed" : d.outcome === "manual" ? "manual" : "fix";
  if (d?.decision === "skip") return "skip";
  if (d?.decision === "track" || d?.issue) return "track";
  return "undecided";
}

export type Chip = { text: string; tone: "fix" | "done" | "skip" | "track" | "manual" };

const CHIP: Record<Exclude<Status, "undecided">, Chip> = {
  fix: { text: "To fix", tone: "fix" },
  fixed: { text: "Fixed", tone: "done" },
  manual: { text: "Manual", tone: "manual" },
  skip: { text: "Skipped", tone: "skip" },
  track: { text: "Tracked", tone: "track" },
};

/** A finding's decision chip in the Outline, or null while it's undecided. */
export function decisionChip(d: DecisionEntry | undefined): Chip | null {
  const s = statusOf(d);
  if (s === "undecided") return null;
  return s === "track" && d?.issue ? { text: d.issue, tone: "track" } : CHIP[s];
}

export type StatusView = "all" | Status;
export const STATUS_VIEWS: readonly StatusView[] = ["all", "undecided", "manual", "fix", "fixed", "skip", "track"];
const STATUS_LABEL: Record<StatusView, string> = { all: "All", undecided: "Undecided", manual: "Manual", fix: "To fix", fixed: "Fixed", skip: "Skipped", track: "Tracked" };

/** The Overview's filter, kept in the query: a status view and a kind (kebab case), null for every kind. */
export type Filter = { status: StatusView; kind: string | null };
export const DEFAULT_FILTER: Filter = { status: "undecided", kind: null };

/** `Duplicated logic`, `duplicated_logic` → `duplicated-logic`; the kind as the query names it. */
const kindKey = (kind: string): string => kind.trim().toLowerCase().replace(/[\s_-]+/g, "-") || "other";

export function parseFilter(q: URLSearchParams): Filter {
  const show = q.get("show");
  const kind = q.get("kind");
  return { status: STATUS_VIEWS.find((v) => v === show) ?? DEFAULT_FILTER.status, kind: kind ? kindKey(kind) : null };
}

/** `?show=all&kind=bug`, defaults left out; empty for the default filter. */
export function filterQuery(f: Filter): string {
  const q = new URLSearchParams();
  if (f.status !== DEFAULT_FILTER.status) q.set("show", f.status);
  if (f.kind) q.set("kind", f.kind);
  const s = q.toString();
  return s ? `?${s}` : "";
}

const inKind = (f: Finding, kind: string | null) => kind == null || kindKey(f.kind) === kind;
const inStatus = (f: Finding, decisions: Decisions, status: StatusView) => status === "all" || statusOf(decisions[f.n]) === status;

export type Tab<K> = { key: K; label: string; count: number; on: boolean };

/** The status row: counts under the current kind; a tab with none hides, except All, Undecided and the one on. */
export function statusTabs(findings: readonly Finding[], decisions: Decisions, filter: Filter): Tab<StatusView>[] {
  const pool = listed(findings).filter((f) => inKind(f, filter.kind));
  return STATUS_VIEWS.map((v) => ({ key: v, label: STATUS_LABEL[v], count: pool.filter((f) => inStatus(f, decisions, v)).length, on: v === filter.status })).filter(
    (t) => t.count || t.on || t.key === "all" || t.key === "undecided",
  );
}

/** The kind row: All kinds, then each kind by its total count (so the order holds across status tabs), ties A–Z; counts under the current status. */
export function kindTabs(findings: readonly Finding[], decisions: Decisions, filter: Filter): Tab<string | null>[] {
  const all = listed(findings);
  const total = new Map<string, number>();
  const label = new Map<string, string>();
  for (const f of all) {
    const k = kindKey(f.kind);
    total.set(k, (total.get(k) ?? 0) + 1);
    if (!label.has(k)) label.set(k, kindLabel(f.kind));
  }
  const pool = all.filter((f) => inStatus(f, decisions, filter.status));
  const kinds = [...total.keys()].sort((a, b) => total.get(b)! - total.get(a)! || label.get(a)!.localeCompare(label.get(b)!));
  return [
    { key: null, label: "All kinds", count: pool.length, on: filter.kind == null },
    ...kinds.map((k) => ({ key: k, label: label.get(k)!, count: pool.filter((f) => kindKey(f.kind) === k).length, on: k === filter.kind })),
  ];
}

export type OverviewGroup = { label: GroupName | "Decided"; findings: Finding[]; collapsed?: boolean };

/** The Overview's groups under a filter. All shows what's still open (undecided, manual) by group, then one collapsed Decided group. */
export function overviewGroups(findings: readonly Finding[], decisions: Decisions, filter: Filter): OverviewGroup[] {
  const pool = findings.filter((f) => inKind(f, filter.kind));
  if (filter.status !== "all") return groups(pool.filter((f) => inStatus(f, decisions, filter.status)));
  const open = (f: Finding) => {
    const s = statusOf(decisions[f.n]);
    return s === "undecided" || s === "manual";
  };
  const decided = listed(pool).filter((f) => !open(f));
  return [...groups(pool.filter(open)), ...(decided.length ? [{ label: "Decided" as const, findings: decided, collapsed: true }] : [])];
}

/** The findings the page walks through under a filter, in Overview order. */
export const shown = (findings: readonly Finding[], decisions: Decisions, filter: Filter): Finding[] =>
  overviewGroups(findings, decisions, filter).flatMap((g) => g.findings);

export type Segment = "decided" | "track" | "open" | "now";

/** The bar's progress segments, one per shown finding: decided (fix or skip), tracked, still open, or the one open. */
export function segments(findings: readonly Finding[], decisions: Decisions, filter: Filter, current: number | null): Segment[] {
  return shown(findings, decisions, filter).map((f) => {
    if (f.n === current) return "now";
    const s = statusOf(decisions[f.n]);
    return s === "undecided" ? "open" : s === "track" ? "track" : "decided";
  });
}

/** Where Walk through starts: the first undecided must-fix finding in the filter, else its first finding. */
export function walkStart(findings: readonly Finding[], decisions: Decisions, filter: Filter): number | null {
  const list = shown(findings, decisions, filter);
  return (list.find((f) => f.must_fix && statusOf(decisions[f.n]) === "undecided") ?? list[0])?.n ?? null;
}

/** The finding before or after `n` in the filter's walk, or null at either end. */
export function step(findings: readonly Finding[], decisions: Decisions, filter: Filter, n: number, by: 1 | -1): number | null {
  const list = shown(findings, decisions, filter);
  const i = list.findIndex((f) => f.n === n);
  return i === -1 ? null : (list[i + by]?.n ?? null);
}

/**
 * The undecided finding to open once `n` is decided: the next after it in `list`, wrapping to the start; null when none is left.
 * Pass the walk from before the decision, since an Undecided view drops `n` from it.
 */
export function nextUndecided(list: readonly Finding[], decisions: Decisions, n: number): number | null {
  const i = list.findIndex((f) => f.n === n);
  const order = [...list.slice(i + 1), ...list.slice(0, Math.max(i, 0))];
  return order.find((f) => f.n !== n && statusOf(decisions[f.n]) === "undecided")?.n ?? null;
}

/** What Queue all queues: the shown findings, less those already queued or fixed (queueing a fixed one would drop its outcome). */
export const queueAllNumbers = (findings: readonly Finding[], decisions: Decisions, filter: Filter): number[] =>
  shown(findings, decisions, filter)
    .filter((f) => !["fix", "fixed"].includes(statusOf(decisions[f.n])))
    .map((f) => f.n);

/** Bulk decisions from the dock: every must-fix finding, or every listed one. */
export const mustFixNumbers = (findings: readonly Finding[]): number[] => findings.filter((f) => f.must_fix).map((f) => f.n);
export const allNumbers = (findings: readonly Finding[]): number[] => listed(findings).map((f) => f.n);

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
