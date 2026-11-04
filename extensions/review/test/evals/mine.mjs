#!/usr/bin/env node
// Finds real bugs in a repo's history to use as eval cases: a commit that fixes something, traced
// by blame back to the commit that introduced the lines it had to change. The introducing commit
// is what a review should have caught, and the fix says what the bug was.
//
// Usage: node evals/mine.mjs --repo <dir> [--limit n] [--max-lines n]
// stdout: {repo, candidates:[{fix, fixSubject, introducing, introducingSubject, files, changedLines, blamedLines}]}
// Candidates still need a person to read the fix and write the rubric: a subject that says "fix"
// proves nothing, and a blamed commit may only have moved the code.
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

// Many subjects describe the corrected behaviour rather than saying "fix".
const FIX = /\b(fix(es|ed)?|bug|crash(es)?|regression|broke(n)?|wrong|race|no longer|stops?|doesn'?t|don'?t|can'?t|won'?t|never)\b/i;
const NOT_A_BUG = /\b(typo|lint|format|style|comment|readme|docs?|test|tests|flaky|rename|merge)\b/i;
const CODE = /\.(ts|tsx|js|jsx|mjs|cjs|mts|cts|py|go|rs|java|kt|cs|c|h|cc|cpp|rb|php|lua|sql|sh)$/i;
const TEST_PATH = /(^|\/)(tests?|__tests__)\/|\.(test|spec)\./i;

function git(repo, ...args) {
  const r = spawnSync("git", ["-C", repo, "-c", "core.quotePath=false", ...args], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
  return r.status === 0 ? r.stdout : null;
}

export function looksLikeBugFix(subject) {
  return FIX.test(subject) && !NOT_A_BUG.test(subject);
}

// [{file, start, count}] of the old-side lines a commit removed or replaced, in code files only.
export function removedRanges(diff) {
  const ranges = [];
  let file = null;
  for (const line of diff.split("\n")) {
    if (line.startsWith("--- ")) {
      file = line === "--- /dev/null" ? null : line.slice(6);
      continue;
    }
    const m = /^@@ -(\d+)(?:,(\d+))? /.exec(line);
    if (!m || !file || !CODE.test(file) || TEST_PATH.test(file)) continue;
    const count = m[2] === undefined ? 1 : Number(m[2]);
    if (count > 0) ranges.push({ file, start: Number(m[1]), count });
  }
  return ranges;
}

function blameCommits(repo, fix, ranges) {
  const counts = new Map();
  for (const { file, start, count } of ranges) {
    const out = git(repo, "blame", "-l", "-s", "-L", `${start},+${count}`, `${fix}^`, "--", file);
    if (!out) continue;
    for (const line of out.split("\n")) {
      const sha = line.split(" ")[0]?.replace(/^\^/, "");
      if (sha) counts.set(sha, (counts.get(sha) ?? 0) + 1);
    }
  }
  return counts;
}

export function mine(repo, { limit = 40, maxLines = 1500 } = {}) {
  const log = git(repo, "log", "--no-merges", "--format=%H%x09%s", "--max-count=3000") ?? "";
  const candidates = [];
  const seen = new Set();
  for (const row of log.split("\n").filter(Boolean)) {
    if (candidates.length >= limit) break;
    const [fix, subject] = row.split("\t");
    if (!looksLikeBugFix(subject ?? "")) continue;
    const diff = git(repo, "show", "--format=", "-U0", "--no-color", "--no-ext-diff", fix);
    if (!diff) continue;
    const ranges = removedRanges(diff);
    if (!ranges.length) continue;
    const blamed = [...blameCommits(repo, fix, ranges)].sort((a, b) => b[1] - a[1]);
    if (!blamed.length) continue;
    const [introducing, blamedLines] = blamed[0];
    if (seen.has(introducing)) continue;
    const stat = git(repo, "show", "--format=%s", "--numstat", introducing);
    if (!stat) continue;
    const [introducingSubject, ...rows] = stat.split("\n").filter(Boolean);
    const parsed = rows.map((r) => r.split("\t"));
    const changedLines = parsed.reduce((n, p) => n + (Number(p[0]) || 0) + (Number(p[1]) || 0), 0);
    // A root commit has no parent to review against, and a huge one is not a review anyone runs.
    if (changedLines > maxLines || git(repo, "rev-parse", "--verify", "-q", `${introducing}^`) === null) continue;
    seen.add(introducing);
    candidates.push({ fix, fixSubject: subject, introducing, introducingSubject, files: [...new Set(ranges.map((r) => r.file))], changedLines, blamedLines });
  }
  return { repo: path.resolve(repo), candidates };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { values } = parseArgs({ options: { repo: { type: "string", default: "." }, limit: { type: "string", default: "40" }, "max-lines": { type: "string", default: "1500" } } });
  console.log(JSON.stringify(mine(values.repo, { limit: Number(values.limit), maxLines: Number(values["max-lines"]) }), null, 2));
}
