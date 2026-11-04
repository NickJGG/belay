import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildPrompt, judgeVerdict, seedOf, tallyOf } from "../evals/run.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const RUNNER = path.join(ROOT, "evals", "run.mjs");

// A stand-in for `claude`: logs each call, answers a review prompt with a report
// and a judge prompt with a verdict. FAKE_MODE picks the failure to simulate.
const FAKE = `
import fs from "node:fs";
let input = "";
process.stdin.on("data", (d) => (input += d)).on("end", () => {
  const mode = process.env.FAKE_MODE || "pass";
  const kind = input.startsWith("Run the") ? "review" : "judge";
  fs.appendFileSync(process.env.FAKE_LOG, JSON.stringify({ kind, args: process.argv.slice(2), cwd: process.cwd(), data: process.env.BELAY_DATA, channel: process.env.BELAY_CHANNEL, dataExists: fs.existsSync(process.env.BELAY_DATA || ""), input }) + "\\n");
  if (kind === "review") {
    if (mode === "empty-report") return;
    const tally = mode === "no-tally" ? "" : '<!-- review-tally: {"critical":1,"important":2,"debt":0,"suggested":3,"question":0,"unverified":1,"plausible":0} -->';
    process.stdout.write("# Review\\n\\n## Scope\\nReviewed 1 file · Seed: 4242\\n\\n" + tally + "\\n");
  } else if (mode !== "judge-empty") {
    process.stdout.write("The finding is present.\\n" + (mode === "fail" ? "FAIL" : "**PASS**") + "\\n");
  }
});
`;

function setup() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-run-"));
  const fake = path.join(dir, "fake-claude.mjs");
  fs.writeFileSync(fake, FAKE);
  return { dir, fake, log: path.join(dir, "calls.log") };
}

function runner(ctx, args, env = {}) {
  const r = spawnSync(process.execPath, [RUNNER, ...args], {
    encoding: "utf8",
    env: { ...process.env, REVIEW_EVAL_CLAUDE: ctx.fake, FAKE_LOG: ctx.log, ...env },
  });
  const calls = fs.existsSync(ctx.log) ? fs.readFileSync(ctx.log, "utf8").trim().split("\n").filter(Boolean).map(JSON.parse) : [];
  return { ...r, calls };
}

function withCtx(fn) {
  const ctx = setup();
  try {
    fn(ctx);
  } finally {
    fs.rmSync(ctx.dir, { recursive: true, force: true });
  }
}

test("a passing run prints CONFIG, SCORE, SEED and RESULT lines", () => {
  withCtx((ctx) => {
    const r = runner(ctx, ["01-small"], { REVIEW_EVAL_RUNS: "2" });
    assert.equal(r.status, 0, r.stderr);
    const lines = r.stdout.trim().split(/\r?\n/);
    assert.match(lines[0], /^CONFIG,model=<cli-default:UNPINNED>,.*runs=2,.*seed=<per-run>/);
    assert.equal(lines.filter((l) => l === "SCORE,01-small-diff-null-deref,1,2,0,3,0,1,0,comment").length, 2);
    assert.ok(lines.includes("SEED,01-small-diff-null-deref,1,4242"));
    assert.ok(lines.includes("RESULT,01-small-diff-null-deref,PASS (2/2)"));
    assert.equal(r.calls.length, 4);
  });
});

test("the review runs in a materialized repo and the judge gets the rubric, layout and report", () => {
  withCtx((ctx) => {
    const r = runner(ctx, ["01-small"]);
    const [review, judge] = r.calls;
    assert.equal(review.kind, "review");
    assert.match(review.input, /^Run the \/review:review skill on this repository's changes\./);
    assert.match(review.cwd, /review-eval-/);
    assert.ok(!fs.existsSync(review.cwd), "the fixture repo is removed after the run");
    assert.deepEqual(review.args, ["-p", "--dangerously-skip-permissions", "--output-format", "json"]);
    assert.equal(judge.kind, "judge");
    assert.match(judge.input, /<report_layout>[\s\S]*Plausible[\s\S]*<rubric>\nPASS only if[\s\S]*<report>\n# Review/);
  });
});

test("the review gets its own data dir, removed after the run, and no channel", () => {
  withCtx((ctx) => {
    const r = runner(ctx, ["01-small"], { BELAY_DATA: path.join(ctx.dir, "real-data"), BELAY_CHANNEL: "1" });
    const [review] = r.calls;
    assert.equal(review.channel, undefined);
    assert.match(review.data, /review-eval-data-/);
    assert.ok(review.dataExists);
    assert.ok(!fs.existsSync(review.data), "the data dir is removed after the run");
  });
});

test("model, effort and seed are passed through", () => {
  withCtx((ctx) => {
    const r = runner(ctx, ["01-small"], { REVIEW_EVAL_MODEL: "opus", REVIEW_EVAL_EFFORT: "high", REVIEW_EVAL_SEED: "7" });
    const [review, judge] = r.calls;
    assert.deepEqual(review.args, ["-p", "--dangerously-skip-permissions", "--output-format", "json", "--effort", "high", "--model", "opus"]);
    assert.deepEqual(judge.args, ["-p", "--dangerously-skip-permissions", "--model", "opus"]);
    assert.match(review.input, /with the arguments "--seed 7"/);
    assert.match(r.stdout, /seed=7/);
    assert.match(r.stdout, /^SEED,01-small-diff-null-deref,1,7$/m);
  });
});

test("a failing judge fails the case and exits 1", () => {
  withCtx((ctx) => {
    const r = runner(ctx, ["01-small"], { FAKE_MODE: "fail" });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /RESULT,01-small-diff-null-deref,FAIL \(0\/1\)/);
  });
});

test("an empty report is retried once, then the case is an ERROR without a judge call", () => {
  withCtx((ctx) => {
    const r = runner(ctx, ["01-small"], { FAKE_MODE: "empty-report" });
    assert.equal(r.status, 1);
    assert.match(r.stdout, /RESULT,01-small-diff-null-deref,ERROR \(0\/1 graded/);
    assert.deepEqual(r.calls.map((c) => c.kind), ["review", "review"]);
  });
});

test("an empty judge reply leaves the run ungraded", () => {
  withCtx((ctx) => {
    const r = runner(ctx, ["01-small"], { FAKE_MODE: "judge-empty" });
    assert.match(r.stdout, /RESULT,01-small-diff-null-deref,ERROR/);
  });
});

test("a report without a tally line prints SCORE MISSING and says so", () => {
  withCtx((ctx) => {
    const r = runner(ctx, ["01-small"], { FAKE_MODE: "no-tally" });
    assert.match(r.stdout, /SCORE,01-small-diff-null-deref,(MISSING|.*,script)/);
    assert.match(r.stderr, /tally/);
  });
});

test("a filter matching nothing exits 3", () => {
  withCtx((ctx) => {
    const r = runner(ctx, ["no-such-case"]);
    assert.equal(r.status, 3);
    assert.match(r.stderr, /NO CASES ran/);
    assert.equal(r.calls.length, 0);
  });
});

test("the keep dir saves evidence and refuses to overwrite it before any call", () => {
  withCtx((ctx) => {
    const keep = path.join(ctx.dir, "keep");
    const a = runner(ctx, ["01-small"], { REVIEW_EVAL_RUNS: "2", REVIEW_EVAL_KEEP_DIR: keep });
    assert.equal(a.status, 0, a.stderr);
    const caseDir = path.join(keep, "01-small-diff-null-deref");
    for (const f of ["CONFIG.txt", "run1.report.md", "run1.judge.txt", "run2.report.md", "run2.judge.txt"]) {
      assert.ok(fs.statSync(path.join(caseDir, f)).size > 0, f);
    }
    assert.match(fs.readFileSync(path.join(caseDir, "CONFIG.txt"), "utf8"), /^CONFIG,model=.*\nskill_root=.*\nskill_head=.*\nskill_dirty=/);
    assert.match(fs.readFileSync(path.join(caseDir, "run1.report.md"), "utf8"), /review-tally/);

    fs.rmSync(ctx.log);
    const b = runner(ctx, ["01-small"], { REVIEW_EVAL_KEEP_DIR: keep });
    assert.equal(b.status, 3);
    assert.match(b.stderr, /refusing to overwrite/);
    assert.equal(b.calls.length, 0);
  });
});

test("evidence on a later selected case refuses before the earlier case spends a call", () => {
  withCtx((ctx) => {
    const keep = path.join(ctx.dir, "keep");
    fs.mkdirSync(path.join(keep, "91-claude-md-stale-claim"), { recursive: true });
    fs.writeFileSync(path.join(keep, "91-claude-md-stale-claim", "old"), "x");
    const r = runner(ctx, ["9"], { REVIEW_EVAL_KEEP_DIR: keep });
    assert.equal(r.status, 3);
    assert.match(r.stderr, /91-claude-md-stale-claim/);
    assert.equal(r.calls.length, 0);
    assert.ok(!fs.existsSync(path.join(keep, "09-untested-exported-logic")));
  });
});

test("a missing claude command exits 127", () => {
  withCtx((ctx) => {
    const r = runner(ctx, ["01-small"], { REVIEW_EVAL_CLAUDE: path.join(ctx.dir, "no-such-claude-binary") });
    assert.equal(r.status, 127);
  });
});

test("helpers: verdict, tally, seed, prompt", () => {
  assert.equal(judgeVerdict("reasoning\n**PASS**\n"), "PASS");
  assert.equal(judgeVerdict("it would PASS except...\nFAIL"), "FAIL");
  assert.equal(judgeVerdict("Verdict: PASS. Nothing else."), "PASS");
  assert.equal(judgeVerdict("no verdict"), null);

  const t = tallyOf('x\n<!-- review-tally: {"critical":2,"important":0,"debt":1,"suggested":0,"question":0,"unverified":0,"plausible":4} -->', "/nonexistent.mjs");
  assert.deepEqual(t, { counts: [2, 0, 1, 0, 0, 0, 4], source: "comment" });
  assert.equal(tallyOf("no tally here", "/nonexistent.mjs"), null);

  assert.equal(seedOf("Reviewed 3 files · **Seed:** `981`"), "981");
  assert.equal(seedOf("no seed"), null);

  assert.doesNotMatch(buildPrompt("/review:review", ""), /--seed/);
  assert.match(buildPrompt("/review:review", "5"), /"--seed 5"/);
});
