#!/usr/bin/env node
// Suite-level scorecard from the RESULT and SCORE lines run.mjs prints.
//
//   Recall      pass-rate over recall cases (success_criteria.must_detect present).
//   Precision   pass-rate over counter-cases (no must_detect: code that must NOT be
//               flagged), i.e. noise resistance.
//   F1          harmonic mean of the two.
//   SNR (proxy) signal = 🔴+🟠 on recall cases, capped per case at its must_detect
//               count; noise = 🔴+🟠 on counter-cases. Derived from case labels and
//               the report's tally line, not per-comment ground truth; shown only
//               when SCORE lines are present.
//
// Usage: node evals/scorecard.mjs [results_file] [--evals DIR]   (stdin without a file)
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export function loadCases(dir) {
  const cases = {};
  if (!fs.existsSync(dir)) return cases;
  for (const name of fs.readdirSync(dir).sort()) {
    if (!name.endsWith(".json")) continue;
    let data;
    try {
      data = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
    } catch {
      continue;
    }
    const mustDetect = data.success_criteria?.must_detect ?? [];
    cases[data.id ?? name.slice(0, -5)] = {
      category: mustDetect.length ? "recall" : "precision",
      mustDetect: mustDetect.length,
    };
  }
  return cases;
}

// SCORE,<id>,critical,important,debt,suggested,question,unverified,plausible,<source>
export function parseLines(lines) {
  const results = {};
  const scores = {};
  for (const raw of lines) {
    const line = raw.trim();
    if (line.startsWith("RESULT,")) {
      const [, id, rest] = line.match(/^RESULT,([^,]+),(.*)$/) ?? [];
      if (id && rest?.trim()) results[id] = rest.trim().split(/\s+/)[0].toUpperCase();
    } else if (line.startsWith("SCORE,")) {
      const parts = line.split(",");
      if (parts.length < 9) continue;
      const nums = parts.slice(2, 9).map(Number);
      if (nums.some((x) => !Number.isInteger(x))) continue;
      (scores[parts[1]] ??= []).push(nums);
    }
  }
  return { results, scores };
}

const meanRow = (rows) => rows[0].map((_, i) => rows.reduce((s, r) => s + r[i], 0) / rows.length);
const pct = (num, den) => (den ? (100 * num) / den : null);
const f1 = (r, p) => (r === null || p === null || r + p === 0 ? null : (2 * r * p) / (r + p));

export function compute(cases, results, scores) {
  const tallies = { recall: [0, 0], precision: [0, 0] };
  let errored = 0;
  let unknown = 0;
  for (const [id, verdict] of Object.entries(results)) {
    const c = cases[id];
    if (!c) {
      unknown++;
      continue;
    }
    if (verdict === "ERROR") {
      errored++;
      continue;
    }
    tallies[c.category][1]++;
    if (verdict === "PASS") tallies[c.category][0]++;
  }
  let signal = 0;
  let noise = 0;
  for (const [id, rows] of Object.entries(scores)) {
    const c = cases[id];
    if (!c) continue;
    const [crit, imp] = meanRow(rows);
    if (c.category === "recall") signal += Math.min(crit + imp, Math.max(1, c.mustDetect));
    else noise += crit + imp;
  }
  const recall = pct(...tallies.recall);
  const precision = pct(...tallies.precision);
  return {
    recall,
    precision,
    f1: f1(recall, precision),
    recallPass: tallies.recall[0],
    recallTotal: tallies.recall[1],
    precisionPass: tallies.precision[0],
    precisionTotal: tallies.precision[1],
    errored,
    unknown,
    signal,
    noise,
    hasScores: Object.keys(scores).length > 0,
  };
}

export function snrValue(signal, noise) {
  if (noise === 0) return signal > 0 ? Infinity : null;
  return signal / noise;
}

const fmtPct = (v) => (v === null ? "  n/a" : `${v.toFixed(1).padStart(5)}%`);
const machine = (v) => (v === null ? "" : v.toFixed(2));

export function render(s) {
  const lines = [
    "review eval scorecard",
    "============================",
    `Graded: ${s.recallTotal + s.precisionTotal} (${s.recallTotal} recall, ${s.precisionTotal} precision) · errored: ${s.errored} · unknown-id: ${s.unknown}`,
    "",
    `Recall      : ${fmtPct(s.recall)}  (${s.recallPass}/${s.recallTotal} recall cases passed)`,
    `Precision   : ${fmtPct(s.precision)}  (${s.precisionPass}/${s.precisionTotal} counter-cases passed)  [noise-resistance]`,
    `F1          : ${fmtPct(s.f1)}`,
  ];
  const snr = s.hasScores ? snrValue(s.signal, s.noise) : null;
  if (s.hasScores) {
    const shown = snr === Infinity ? "  inf" : snr === null ? "  n/a" : snr.toFixed(2).padStart(5);
    lines.push("", `SNR (proxy) : ${shown}  (signal=${s.signal.toFixed(1)} / noise=${s.noise.toFixed(1)} 🔴+🟠 findings)  [approx, see evals/README.md]`);
  }
  const snrMachine = snr === Infinity ? "inf" : snr === null ? "" : snr.toFixed(4);
  lines.push(
    "",
    `SCORECARD,recall=${machine(s.recall)},precision=${machine(s.precision)},f1=${machine(s.f1)},snr=${snrMachine},signal=${s.signal.toFixed(1)},noise=${s.noise.toFixed(1)}`,
  );
  return lines.join("\n");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  let evalsDir = HERE;
  let file = null;
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--evals") evalsDir = args[++i];
    else file = args[i];
  }
  const text = fs.readFileSync(file ?? 0, "utf8");
  const { results, scores } = parseLines(text.split(/\r?\n/));
  console.log(render(compute(loadCases(evalsDir), results, scores)));
}
