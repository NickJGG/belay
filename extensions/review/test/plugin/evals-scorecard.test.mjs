import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { compute, loadCases, parseLines, render, snrValue } from "../evals/scorecard.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

const CASES = {
  "01-a": { category: "recall", mustDetect: 1 },
  "02-b": { category: "recall", mustDetect: 2 },
  "03-c": { category: "precision", mustDetect: 0 },
  "04-d": { category: "precision", mustDetect: 0 },
};

const run = (lines) => {
  const { results, scores } = parseLines(lines);
  return compute(CASES, results, scores);
};

test("recall and precision are pass-rates over their categories", () => {
  const s = run(["RESULT,01-a,PASS (1/1)", "RESULT,02-b,FAIL (0/1)", "RESULT,03-c,PASS (2/3)", "RESULT,04-d,PASS (1/1)"]);
  assert.equal(s.recall, 50);
  assert.equal(s.precision, 100);
  assert.ok(Math.abs(s.f1 - 66.6667) < 0.01);
});

test("errored and unknown cases stay out of the rates", () => {
  const s = run(["RESULT,01-a,ERROR (0/1 graded)", "RESULT,02-b,PASS (1/1)", "RESULT,99-zz,PASS (1/1)"]);
  assert.equal(s.errored, 1);
  assert.equal(s.unknown, 1);
  assert.equal(s.recallTotal, 1);
  assert.equal(s.precision, null);
});

test("SNR caps signal per recall case and counts all 🔴+🟠 on counter-cases", () => {
  const s = run(["SCORE,01-a,3,2,0,0,0,0,0,comment", "SCORE,02-b,0,1,0,0,0,1,0,comment", "SCORE,03-c,0,1,4,0,0,0,0,script"]);
  assert.equal(s.signal, 2);
  assert.equal(s.noise, 1);
  assert.equal(snrValue(s.signal, s.noise), 2);
});

test("SNR averages several runs of one case", () => {
  const s = run(["SCORE,03-c,1,0,0,0,0,0,0,comment", "SCORE,03-c,0,0,0,0,0,0,0,comment"]);
  assert.equal(s.noise, 0.5);
});

test("MISSING and malformed SCORE lines are ignored; no scores omits SNR", () => {
  const s = run(["SCORE,01-a,MISSING", "SCORE,01-a,1,x,0,0,0,0,0,comment", "RESULT,01-a,PASS (1/1)"]);
  assert.equal(s.hasScores, false);
  assert.doesNotMatch(render(s), /SNR \(proxy\)/);
  assert.match(render(s), /^SCORECARD,recall=100\.00,precision=,f1=,snr=,/m);
});

test("zero noise with signal is infinite SNR", () => {
  assert.equal(snrValue(1, 0), Infinity);
  assert.equal(snrValue(0, 0), null);
});

test("loadCases labels the real suite and the CLI reads a results file", () => {
  const cases = loadCases(path.join(ROOT, "evals"));
  assert.equal(cases["01-small-diff-null-deref"].category, "recall");
  assert.equal(cases["55-thread-confined-no-race"].category, "precision");

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-sc-"));
  try {
    const file = path.join(dir, "results.txt");
    fs.writeFileSync(file, "RESULT,01-small-diff-null-deref,PASS (1/1)\nRESULT,55-thread-confined-no-race,FAIL (0/1)\n");
    const r = spawnSync(process.execPath, [path.join(ROOT, "evals/scorecard.mjs"), file], { encoding: "utf8" });
    assert.equal(r.status, 0);
    assert.match(r.stdout, /SCORECARD,recall=100\.00,precision=0\.00,/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
