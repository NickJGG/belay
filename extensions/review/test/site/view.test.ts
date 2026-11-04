import assert from "node:assert/strict";
import { test } from "node:test";
import type { Checking, Decisions, Review, Stage } from "../../cli/state.ts";
import { finding } from "../fixtures.ts";
import {
  checkingSplit,
  decisionChip,
  elapsed,
  expandRange,
  filterRows,
  groups,
  hunkSpan,
  kindLabel,
  openFilter,
  parseView,
  reviewRow,
  segments,
  sentence,
  step,
  stageRows,
  toFix,
  verdictLine,
  viewHash,
  walkStart,
} from "../../web/_lib/view.ts";

const findings = [finding(1, "critical"), finding(2, "important"), finding(3, "debt"), finding(4, "suggested"), finding(5, "refuted"), finding(6, "unverified")];

const review = (over: Partial<Review> = {}): Review => ({
  id: "review-20261104-1402-last-commit",
  project: "BEL",
  root: "C:/repo",
  target: "last commit",
  ref: "884bdaa",
  mode: "diff",
  tier: "medium",
  seed: 1,
  preview: { files: 14, reviewers: 8 },
  started: "2026-11-04T14:02:00Z",
  finished: "2026-11-04T14:06:00Z",
  status: "done",
  partial: null,
  campaign: null,
  stages: [],
  ...over,
});

test("titles are sentence case unless they start with code", () => {
  assert.equal(sentence("last commit"), "Last commit");
  assert.equal(sentence("src/"), "src/");
  assert.equal(sentence("generate() deletes a stub"), "generate() deletes a stub");
  assert.equal(sentence("PR #12"), "PR #12");
  assert.equal(kindLabel("duplicated-logic"), "Duplicated logic");
});

test("groups follow the report: must fix first, refuted left out", () => {
  const g = groups(findings);
  assert.deepEqual(
    g.map((x) => x.label),
    ["Must fix", "Unverified", "Quality"],
  );
  assert.deepEqual(
    g.map((x) => x.findings.map((f) => f.n)),
    [[1, 2], [6], [3, 4]],
  );
});

test("walking goes in group order, starting at the first undecided must-fix", () => {
  const d: Decisions = { 1: { decision: "fix", at: "t", by: "user" } };
  assert.equal(walkStart(findings, d), 2);
  assert.equal(walkStart(findings, { ...d, 2: { decision: "skip", at: "t", by: "user" } }), 1);
  assert.equal(step(findings, 2, 1), 6);
  assert.equal(step(findings, 6, 1), 3);
  assert.equal(step(findings, 1, -1), null);
  assert.equal(step(findings, 4, 1), null);
});

test("segments mark decided, tracked, open and the current finding", () => {
  const d: Decisions = { 1: { decision: "fix", at: "t", by: "user" }, 3: { decision: "track", issue: "BEL-9", at: "t", by: "user" } };
  assert.deepEqual(segments(findings, d, 2), ["decided", "now", "open", "track", "open"]);
});

test("decision chips: to fix, fixed, manual, skipped, tracked", () => {
  assert.equal(decisionChip(undefined), null);
  assert.deepEqual(decisionChip({ decision: "fix", at: "t", by: "user" }), { text: "To fix", tone: "fix" });
  assert.deepEqual(decisionChip({ decision: "fix", outcome: "applied", at: "t", by: "user" }), { text: "Fixed", tone: "done" });
  assert.deepEqual(decisionChip({ decision: "fix", outcome: "manual", at: "t", by: "user" }), { text: "Manual", tone: "manual" });
  assert.deepEqual(decisionChip({ decision: "skip", at: "t", by: "user" }), { text: "Skipped", tone: "skip" });
  assert.deepEqual(decisionChip({ issue: "BEL-9", at: "t", by: "user" }), { text: "BEL-9", tone: "track" });
  assert.equal(toFix({ 1: { decision: "fix", at: "t", by: "u" }, 2: { decision: "fix", outcome: "applied", at: "t", by: "u" } }), 1);
});

test("a list row: red while a must-fix is open, green once applied or clean", () => {
  const open = reviewRow(review(), findings, {});
  assert.equal(open.title, "Last commit");
  assert.equal(open.tone, "bad");
  assert.deepEqual(open.verdict, { strong: "2 must-fix", rest: " · 3 more" });
  assert.equal(open.state, "needs-you");
  const applied: Decisions = {
    1: { decision: "fix", outcome: "applied", at: "t", by: "claude" },
    2: { decision: "fix", outcome: "applied", at: "t", by: "claude" },
  };
  const done = reviewRow(review(), findings, applied);
  assert.equal(done.tone, "ok");
  assert.deepEqual(done.verdict, { rest: "Fixes applied" });
  assert.equal(done.state, "done");
  const queued = reviewRow(review(), findings, { 1: { decision: "fix", at: "t", by: "u" }, 2: { decision: "skip", at: "t", by: "u" } });
  assert.equal(queued.tone, "bad");
  assert.equal(queued.toFix, 1);
  assert.deepEqual(reviewRow(review(), [finding(1, "debt")], {}).verdict, { rest: "Clean · 1 more" });
  assert.equal(reviewRow(review({ campaign: { unit: 4, of: 12 } }), [], {}).campaign, "Campaign · 4 of 12");
  assert.equal(reviewRow(review({ status: "running" }), [], {}).tone, "running");
  assert.deepEqual(verdictLine([finding(1, "debt")]), { rest: "Nothing must be fixed · 1 more" });
});

test("Needs you lists running reviews first; the list opens on it while it has rows", () => {
  const rows = [reviewRow(review({ id: "a" }), [], {}), reviewRow(review({ id: "b" }), findings, {}), reviewRow(review({ id: "c", status: "running" }), [], {})];
  assert.deepEqual(
    filterRows(rows, "needs-you").map((r) => r.id),
    ["c", "b"],
  );
  assert.deepEqual(
    filterRows(rows, "done").map((r) => r.id),
    ["a"],
  );
  assert.equal(openFilter("", rows), "needs-you");
  assert.equal(openFilter("#done", rows), "done");
  assert.equal(openFilter("", [rows[0]]), "all");
});

test("the view lives in the hash; an unknown finding is the Overview", () => {
  assert.deepEqual(parseView("#f-2", findings), { kind: "finding", n: 2 });
  assert.deepEqual(parseView("#f-99", findings), { kind: "overview" });
  assert.deepEqual(parseView("", findings), { kind: "overview" });
  assert.equal(viewHash({ kind: "finding", n: 3 }), "#f-3");
});

test("stage rows: times so far while doing, counts as a meter", () => {
  const now = Date.parse("2026-11-04T14:04:31Z");
  const stages: Stage[] = [
    { name: "plan", status: "done", started: "2026-11-04T14:02:00Z", finished: "2026-11-04T14:02:12Z" },
    { name: "reviewers", status: "doing", started: "2026-11-04T14:02:00Z", finished: null, done: 5, of: 8 },
    { name: "report", status: "todo", started: null, finished: null },
  ];
  const rows = stageRows(stages, now);
  assert.deepEqual(
    rows.map((r) => r.time),
    ["0:12", "2:31", ""],
  );
  assert.deepEqual(rows[1].count, { done: 5, of: 8, pct: 63 });
  assert.equal(elapsed("2026-11-04T12:00:00Z", "2026-11-04T13:01:05Z", 0), "1:01:05");
});

test("while running, confirmed must-fix and pending checks are counted apart", () => {
  const c = (verdict: string | null, severity = "IMPORTANT"): Checking => ({ key: `${verdict}${severity}`, title: "t", file: "a.ts", line: 1, severity, verdict });
  const s = checkingSplit([c("confirmed"), c("confirmed", "DEBT"), c(null), c("refuted")]);
  assert.equal(s.confirmed.length, 2);
  assert.equal(s.pending.length, 1);
  assert.equal(s.mustFix, 1);
});

test("Show 20 lines extends the hunk's new-side span, never above line 1", () => {
  const span = hunkSpan([
    { kind: " ", line: 84, text: "" },
    { kind: "-", line: null, text: "" },
    { kind: "+", line: 86, text: "" },
  ]);
  assert.deepEqual(span, { first: 84, last: 86 });
  assert.deepEqual(expandRange(span!, "above"), { from: 64, to: 83 });
  assert.deepEqual(expandRange(span!, "below"), { from: 87, to: 106 });
  assert.deepEqual(expandRange({ first: 5, last: 9 }, "above"), { from: 1, to: 4 });
  assert.equal(expandRange({ first: 1, last: 9 }, "above"), null);
  assert.equal(hunkSpan([{ kind: "-", line: 3, text: "" }]), null);
});
