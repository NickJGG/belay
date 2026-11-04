#!/usr/bin/env node
// Headless, LLM-graded eval runner for /review:review.
//
// For each case (optionally filtered by an id substring), RUNS times:
//   1. materialize its fixture into a fresh temp git repo;
//   2. run /review:review there with `claude -p` and capture the report;
//   3. grade the report against the case's rubric with a second `claude -p` (the judge).
// A case passes when more than half its graded runs pass. Prints
// `RESULT,<id>,PASS|FAIL|ERROR (k/n)`, one `SCORE` line per graded run (the
// report's tally), one `SEED` line per graded run (the file-order seed, so a run
// can be replayed) and one `USAGE` line per graded run (what the review cost). Each run is a full review plus a judge call: expensive.
//
// Env:
//   REVIEW_EVAL_RUNS=N      runs per case (default 1); >1 smooths LLM noise.
//   REVIEW_EVAL_MODEL=M     --model M for BOTH calls. Unset = whatever the CLI
//                                  defaults to, which an A/B cannot attribute: set it
//                                  on every run whose numbers will be compared.
//   REVIEW_EVAL_EFFORT=L    --effort L for the review. Unset measures the real
//                                  operating point; low effort suppresses recall.
//   REVIEW_EVAL_SEED=N      pass --seed N to the skill, so every run replays
//                                  the same file order. Unset = a fresh seed per run,
//                                  read back from the report's Scope line.
//   REVIEW_EVAL_ARGS="..."  arguments passed to the skill, for an A/B arm, such as
//                                  "--quality split" or "--passes 1 --effort xhigh".
//   REVIEW_EVAL_TIMEOUT=S   seconds per claude call (default 900).
//   REVIEW_EVAL_KEEP_DIR=D  save D/<id>/CONFIG.txt and run<r>.{report.md,judge.txt}.
//                                  Refuses (exit 3, before any claude call) when a
//                                  selected D/<id>/ already has files.
//   REVIEW_EVAL_CLAUDE=CMD  the claude command (default `claude`); a .mjs/.js
//                                  path runs under node. Tests point it at a fake.
//   REVIEW_EVAL_DIR=D       the cases folder (default: this folder).
//
// Usage: node evals/run.mjs [id-substring]
// Exit: 0 all passed, 1 a failure or error, 3 nothing ran / keep-dir refusal, 127 no claude.
import { spawn, spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { materialize } from "./materialize.mjs";
import { listCaseFiles } from "./validate.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SKILL_ROOT = path.join(HERE, "..", "..", "plugin");

// The judge reads only the report, so it needs the report's layout spelled out.
export const JUDGE_GUIDE = `How a /review:review report is laid out:
- The MAIN report is the 🔴 Critical, 🟠 Important and 🔬 Unverified sections (Unverified findings keep the severity shown; they are runtime claims nobody could observe) and the Quality section (🟡 Debt, 🔵 Suggested, ⚪ Questions, grouped by reviewer). A finding there counts as reported at the severity it shows.
- "Plausible" holds findings that were neither proven nor disproved. It is NOT the main report: a rubric that asks for the main report, or forbids an appendix or low-confidence section, is not met by a finding that sits only in Plausible.
- "Already there" lists older problems the change did not cause or reach. A finding that sits only there counts as dismissed as pre-existing. Pre-existing code the change calls into is reported in the main sections, tagged as older code, and that counts as reported.
- "Refuted" lists findings the review checked and set aside, one line each with the reason. A Refuted line is never a finding: it does not count as flagging something, and a defect that sits only in Refuted was dropped.
- Checks is the table of typecheck, lint and test commands with their results. Scope lists the reviewed and skipped files and reviewers and the seed. Neither is a finding.
- A rubric that says "the appendix" means Plausible; "verdict: keep" means confirmed.`;

export function buildPrompt(query, seed, extra = "") {
  const list = [seed ? `--seed ${seed}` : "", extra].filter(Boolean).join(" ");
  const args = list ? ` with the arguments "${list}"` : "";
  return (
    `Run the ${query} skill on this repository's changes${args}. ` +
    "Output ONLY the final review report. If the skill asks whether to review everything or narrow the target, review everything. " +
    "Do not wait for a reply, do not carry out any of the commands listed at the end of the report, and do not call AskUserQuestion."
  );
}

export function buildJudgePrompt(rubric, report) {
  return (
    "You are grading a code-review report against a rubric. Reason briefly, then on the LAST line output exactly PASS or FAIL.\n\n" +
    `<report_layout>\n${JUDGE_GUIDE}\n</report_layout>\n\n<rubric>\n${rubric}\n</rubric>\n\n<report>\n${report}\n</report>\n`
  );
}

export function rubricOf(spec) {
  return spec.grader?.rubric || (spec.expected_behavior ?? []).join("\n");
}

// --output-format json wraps the report with what the run cost. Plain text passes through, so a
// CLI that prints no envelope still grades; it just has no USAGE line.
export function unwrap(stdout) {
  try {
    const envelope = JSON.parse(stdout);
    if (envelope && typeof envelope.result === "string") return { text: envelope.result, usage: envelope };
  } catch {
    // not an envelope
  }
  return { text: stdout, usage: null };
}

export function usageLine(id, run, envelope) {
  const u = envelope?.usage;
  if (!u) return `USAGE,${id},${run},MISSING`;
  const cost = envelope.total_cost_usd === undefined ? "unknown" : envelope.total_cost_usd.toFixed(2);
  return `USAGE,${id},${run},cost_usd=${cost},input=${u.input_tokens ?? 0},cache_read=${u.cache_read_input_tokens ?? 0},cache_write=${u.cache_creation_input_tokens ?? 0},output=${u.output_tokens ?? 0},turns=${envelope.num_turns ?? "unknown"},duration_ms=${envelope.duration_ms ?? "unknown"}`;
}

export const badReport = (text) => !text.trim() || text.includes("API Error") || text.includes("Execution error");

// PASS/FAIL from the judge's last line; else its last PASS/FAIL token; else null.
export function judgeVerdict(text) {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const last = (lines.at(-1) ?? "").replace(/[^A-Za-z]/g, "").toUpperCase();
  if (last === "PASS" || last === "FAIL") return last;
  const tokens = text.match(/\b(PASS|FAIL)\b/gi);
  return tokens ? tokens.at(-1).toUpperCase() : null;
}

const TIERS = ["critical", "important", "debt", "suggested", "question", "unverified", "plausible"];

// Counts from the report's `<!-- review-tally: {...} -->` line, falling back
// to scripts/tally.mjs (which recovers counts from the sections) when the line is
// missing. The source travels with the numbers so a repaired tally is never read
// as an obeyed instruction.
export function tallyOf(report, tallyScript = path.join(SKILL_ROOT, "scripts", "tally.mjs")) {
  const matches = [...report.matchAll(/review-tally:\s*(\{.*?\})\s*-->/g)];
  if (matches.length) {
    try {
      const d = JSON.parse(matches.at(-1)[1]);
      return { counts: TIERS.map((k) => Number.parseInt(d[k] ?? 0, 10) || 0), source: "comment" };
    } catch {
      // fall through to the script
    }
  }
  if (!fs.existsSync(tallyScript)) return null;
  const r = spawnSync(process.execPath, [tallyScript, "--source"], { input: report, encoding: "utf8" });
  if (r.status !== 0) return null;
  try {
    const d = JSON.parse(r.stdout);
    return { counts: TIERS.map((k) => Number(d[k] ?? 0) || 0), source: d.source || "script" };
  } catch {
    return null;
  }
}

export function seedOf(report) {
  const m = [...report.matchAll(/\bSeed\b\W{0,8}(\d+)/gi)];
  return m.length ? m.at(-1)[1] : null;
}

function claudeCommand(env) {
  const cmd = env.REVIEW_EVAL_CLAUDE || "claude";
  if (/\.(mjs|cjs|js)$/i.test(cmd)) return { file: process.execPath, pre: [cmd], shell: false };
  return { file: cmd, pre: [], shell: process.platform === "win32" && /\.(cmd|bat)$/i.test(cmd) };
}

function killTree(child) {
  if (process.platform === "win32") spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  else child.kill("SIGKILL");
}

// Resolves {stdout, ok, missing}; the prompt goes on stdin so no shell quoting is involved.
function runClaude(cmd, args, input, cwd, timeoutMs, env = process.env) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn(cmd.file, [...cmd.pre, ...args], { cwd, env, shell: cmd.shell, stdio: ["pipe", "pipe", "ignore"], windowsHide: true });
    } catch (e) {
      resolve({ stdout: "", ok: false, missing: e.code === "ENOENT" });
      return;
    }
    let stdout = "";
    let done = false;
    const finish = (r) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      resolve(r);
    };
    const timer = setTimeout(() => {
      killTree(child);
      finish({ stdout, ok: false, missing: false, timedOut: true });
    }, timeoutMs);
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", (d) => (stdout += d));
    child.on("error", (e) => finish({ stdout, ok: false, missing: e.code === "ENOENT" }));
    child.on("close", (code) => finish({ stdout, ok: code === 0, missing: false }));
    child.stdin.on("error", () => {});
    child.stdin.end(input);
  });
}

function skillProvenance() {
  const head = spawnSync("git", ["-C", SKILL_ROOT, "rev-parse", "HEAD"], { encoding: "utf8" });
  if (head.status !== 0) return { head: "<not a git repo>", dirty: "<unknown>" };
  const status = spawnSync("git", ["-C", SKILL_ROOT, "status", "--porcelain", "--", "."], { encoding: "utf8" });
  return { head: head.stdout.trim(), dirty: String(Boolean(status.stdout.trim())) };
}

export async function main(argv = process.argv.slice(2), env = process.env, out = console.log, err = console.error) {
  const filter = argv[0] ?? "";
  const evalsDir = env.REVIEW_EVAL_DIR || HERE;
  const runs = Math.max(1, Number.parseInt(env.REVIEW_EVAL_RUNS || "1", 10) || 1);
  const timeoutS = Number.parseInt(env.REVIEW_EVAL_TIMEOUT || "900", 10) || 900;
  const seed = env.REVIEW_EVAL_SEED || "";
  const extra = env.REVIEW_EVAL_ARGS || "";
  const keep = env.REVIEW_EVAL_KEEP_DIR || "";
  const model = env.REVIEW_EVAL_MODEL ? ["--model", env.REVIEW_EVAL_MODEL] : [];
  const effort = env.REVIEW_EVAL_EFFORT ? ["--effort", env.REVIEW_EVAL_EFFORT] : [];
  const cmd = claudeCommand(env);

  const selected = listCaseFiles(evalsDir).filter((f) => !filter || path.basename(f, ".json").includes(filter));

  // Refuse before any claude call, so a later case's evidence is never found after
  // earlier cases already spent calls.
  if (keep) {
    for (const f of selected) {
      const dir = path.join(keep, path.basename(f, ".json"));
      if (fs.existsSync(dir) && fs.readdirSync(dir).length) {
        err(`run: ${dir} exists and is non-empty; refusing to overwrite evidence. Use a new REVIEW_EVAL_KEEP_DIR.`);
        return 3;
      }
    }
  }

  const configLine =
    `CONFIG,model=${env.REVIEW_EVAL_MODEL || "<cli-default:UNPINNED>"},effort=${env.REVIEW_EVAL_EFFORT || "<skill-default>"}` +
    `,runs=${runs},timeout=${timeoutS},seed=${seed || "<per-run>"},args=${extra || "<none>"}`;
  out(configLine);

  let pass = 0;
  let fail = 0;
  let errored = 0;
  const judgeCwd = os.tmpdir();
  for (const file of selected) {
    const id = path.basename(file, ".json");
    const spec = JSON.parse(fs.readFileSync(file, "utf8"));
    const prompt = buildPrompt(spec.query || "/review:review", seed, extra);
    const rubric = rubricOf(spec);
    const caseKeep = keep ? path.join(keep, id) : "";
    if (caseKeep) {
      fs.mkdirSync(caseKeep, { recursive: true });
      const prov = skillProvenance();
      fs.writeFileSync(path.join(caseKeep, "CONFIG.txt"), `${configLine}\nskill_root=${SKILL_ROOT}\nskill_head=${prov.head}\nskill_dirty=${prov.dirty}\n`);
    }

    let passed = 0;
    let graded = 0;
    for (let r = 1; r <= runs; r++) {
      let repo;
      try {
        repo = materialize(spec);
      } catch (e) {
        err(`run: ${id}: materialize failed: ${e.message}`);
        continue;
      }
      // The skill saves every review to Belay's data dir; a throwaway one keeps eval runs out of ~/Belay. Without
      // BELAY_CHANNEL (inherited when the runner starts from a `belay claude` session) it prints the full report.
      const data = fs.mkdtempSync(path.join(os.tmpdir(), "review-eval-data-"));
      try {
        const { BELAY_CHANNEL: _, ...inherited } = { ...process.env, ...env };
        const reviewEnv = { ...inherited, BELAY_DATA: data };
        const review = () =>
          runClaude(cmd, ["-p", "--dangerously-skip-permissions", "--output-format", "json", ...effort, ...model], prompt, repo, timeoutS * 1000, reviewEnv);
        let res = await review();
        if (res.missing) {
          err(`run: '${cmd.file}' not found. Install Claude Code or set REVIEW_EVAL_CLAUDE.`);
          return 127;
        }
        if (badReport(unwrap(res.stdout).text)) res = await review();
        const { text: report, usage } = unwrap(res.stdout);
        if (badReport(report)) continue;
        if (caseKeep) fs.writeFileSync(path.join(caseKeep, `run${r}.report.md`), report);

        const judged = await runClaude(cmd, ["-p", "--dangerously-skip-permissions", ...model], buildJudgePrompt(rubric, report), judgeCwd, timeoutS * 1000);
        if (caseKeep) fs.writeFileSync(path.join(caseKeep, `run${r}.judge.txt`), judged.stdout);
        if (!judged.stdout.trim()) {
          err(`run: ${id} run ${r}: the judge returned nothing; run not graded.`);
          continue;
        }
        graded++;
        if (judgeVerdict(judged.stdout) === "PASS") passed++;

        // The tally is the only continuous signal an A/B has, so losing it is said aloud.
        const tally = tallyOf(report);
        if (tally) {
          out(`SCORE,${id},${tally.counts.join(",")},${tally.source}`);
          if (tally.source !== "comment") err(`run: ${id}: the report dropped its review-tally line; tally recovered from ${tally.source}.`);
        } else {
          out(`SCORE,${id},MISSING`);
          err(`run: ${id}: no tally recoverable from the report.`);
        }
        out(`SEED,${id},${r},${seed || seedOf(report) || "unknown"}`);
        out(usageLine(id, r, usage));
      } finally {
        fs.rmSync(repo, { recursive: true, force: true, maxRetries: 3 });
        fs.rmSync(data, { recursive: true, force: true, maxRetries: 3 });
      }
    }

    if (graded === 0) {
      errored++;
      out(`RESULT,${id},ERROR (0/${runs} graded: infra/transient)`);
    } else if (passed * 2 > graded) {
      pass++;
      out(`RESULT,${id},PASS (${passed}/${graded})`);
    } else {
      fail++;
      out(`RESULT,${id},FAIL (${passed}/${graded})`);
    }
  }

  out(`headless evals: ${pass} passed, ${fail} failed, ${errored} errored (runs/case=${runs}, model=${env.REVIEW_EVAL_MODEL || "<cli-default:UNPINNED>"})`);
  // A filter that matched nothing must not look like a green suite.
  if (pass + fail + errored === 0) {
    err(`run: NO CASES ran${filter ? ` (filter "${filter}" matched nothing)` : ""}; not a pass.`);
    return 3;
  }
  return fail === 0 && errored === 0 ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exitCode = await main();
}
