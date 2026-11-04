#!/usr/bin/env node
// Schema gate for the eval cases: catches a malformed case here, for free,
// instead of on an expensive `claude -p` run.
//
// Per case (ERROR fails the gate):
//   - parses as a JSON object; id == filename stem
//   - skill == "review"; query starts with "/review:review"
//   - no string anywhere still names /review-all (a stale invocation or rubric)
//   - grader.rubric is a non-empty string (the only field the judge reads)
//   - fixture.kind == "synthetic-diff"; fixture has only known keys (the cut
//     seed_profile_cache / seed_state_file fields are errors, not warnings)
//   - fixture materializes: a non-empty files{} whose entries carry before/after/delete
//     (delete needs a before), or rename_only with integer files_changed >= 1
//   - the fixture yields a reviewable diff, unless the id is the empty-diff no-op
//   - success_criteria.must_detect[].verdict, when given, is a known verdict
//   - when scripts/select-files.mjs exists: file selection leaves some file
//     reviewable and keeps every must_detect file in reach (a planted defect in an
//     excluded path would read as a model regression, not the config bug it is)
// WARN: grader.method != llm-rubric, unknown per-file keys, no success_criteria.
//
// Usage: node evals/validate.mjs [EVALS_DIR]   exit 0 valid, 1 errors, 2 bad usage
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_SELECTOR = path.join(HERE, "..", "..", "plugin", "scripts", "select-files.mjs");

const FILE_ENTRY_KEYS = new Set(["before", "after", "delete"]);
const FIXTURE_KEYS = new Set(["kind", "repo", "commit", "files", "description", "files_changed", "rename_only", "tests_pass"]);
const VERDICTS = new Set(["confirmed", "plausible", "unverified", "refuted"]);
export const EMPTY_DIFF_ALLOWLIST = new Set(["04-empty-diff-noop"]);

const nonEmpty = (v) => typeof v === "string" && v.trim() !== "";

export function listCaseFiles(dir) {
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".json") && !f.toLowerCase().startsWith("readme"))
    .sort()
    .map((f) => path.join(dir, f));
}

function strings(value, out = []) {
  if (typeof value === "string") out.push(value);
  else if (value && typeof value === "object") for (const v of Object.values(value)) strings(v, out);
  return out;
}

export function validateCase(file) {
  const errors = [];
  const warnings = [];
  const name = path.basename(file);
  const stem = name.replace(/\.json$/, "");

  let spec;
  try {
    spec = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch (e) {
    return { errors: [`${name}: not valid JSON (${e.message})`], warnings };
  }
  if (!spec || typeof spec !== "object" || Array.isArray(spec)) {
    return { errors: [`${name}: top-level JSON must be an object`], warnings };
  }

  if (spec.id !== stem) errors.push(`${name}: id (${JSON.stringify(spec.id)}) != filename stem (${stem})`);
  if (spec.skill !== "review") errors.push(`${name}: skill must be "review"`);
  if (!nonEmpty(spec.query) || !spec.query.startsWith("/review:review")) {
    errors.push(`${name}: query must start with "/review:review"`);
  }
  if (strings(spec).some((s) => /review-all/.test(s))) errors.push(`${name}: still mentions review-all`);

  const grader = spec.grader;
  if (!grader || typeof grader !== "object") {
    errors.push(`${name}: missing 'grader' object`);
  } else {
    if (!nonEmpty(grader.rubric)) errors.push(`${name}: grader.rubric missing/empty (judge would grade against nothing)`);
    if (grader.method !== undefined && grader.method !== "llm-rubric") {
      warnings.push(`${name}: grader.method ${JSON.stringify(grader.method)} != 'llm-rubric'`);
    }
  }

  if (!("success_criteria" in spec)) {
    warnings.push(`${name}: no success_criteria (documentation aid, not enforced)`);
  } else {
    for (const want of spec.success_criteria?.must_detect ?? []) {
      if (want && typeof want === "object" && "verdict" in want && !VERDICTS.has(want.verdict)) {
        errors.push(`${name}: must_detect verdict ${JSON.stringify(want.verdict)} not in ${[...VERDICTS].join("/")}`);
      }
    }
  }

  const fx = spec.fixture;
  if (!fx || typeof fx !== "object") {
    errors.push(`${name}: missing 'fixture' object`);
    return { errors, warnings, spec };
  }
  if (fx.kind === "real-commit") {
    if (typeof fx.repo !== "string" || !fx.repo) errors.push(`${name}: a real-commit fixture needs fixture.repo`);
    if (typeof fx.commit !== "string" || !fx.commit) errors.push(`${name}: a real-commit fixture needs fixture.commit`);
    return { errors, warnings, spec };
  }
  if (fx.kind !== "synthetic-diff") errors.push(`${name}: fixture.kind ${JSON.stringify(fx.kind)} is not "synthetic-diff"`);
  for (const key of Object.keys(fx)) {
    if (!FIXTURE_KEYS.has(key)) errors.push(`${name}: fixture.${key} is not a supported field`);
  }

  let hasDiff = false;
  const files = fx.files;
  if (files && typeof files === "object" && Object.keys(files).length) {
    for (const [rel, entry] of Object.entries(files)) {
      if (!entry || typeof entry !== "object") {
        errors.push(`${name}: fixture.files[${rel}] must be an object`);
        continue;
      }
      const keys = Object.keys(entry);
      if (!keys.some((k) => FILE_ENTRY_KEYS.has(k))) errors.push(`${name}: fixture.files[${rel}] has none of before/after/delete`);
      const unknown = keys.filter((k) => !FILE_ENTRY_KEYS.has(k));
      if (unknown.length) warnings.push(`${name}: fixture.files[${rel}] unknown keys ${unknown.join(",")} (typo? materialize ignores them)`);
      if (entry.delete) {
        if (!("before" in entry)) errors.push(`${name}: fixture.files[${rel}] delete:true needs a 'before'`);
        else hasDiff = true;
      } else if ("after" in entry && entry.after !== entry.before) {
        hasDiff = true;
      }
    }
  } else if (fx.rename_only) {
    const fc = fx.files_changed;
    if (!Number.isInteger(fc) || fc < 1) errors.push(`${name}: rename_only needs integer files_changed >= 1 (got ${JSON.stringify(fc)})`);
    else hasDiff = true;
  } else {
    errors.push(`${name}: fixture has neither a non-empty 'files' map nor rename_only+files_changed`);
  }

  if (!hasDiff && !EMPTY_DIFF_ALLOWLIST.has(stem)) {
    errors.push(`${name}: fixture yields an empty diff (nothing to review) and is not allowlisted`);
  }
  return { errors, warnings, spec };
}

function selectorRecords(files) {
  return Object.entries(files).map(([p, entry]) => {
    let status;
    let body;
    if (entry.delete) [status, body] = ["D", entry.before ?? ""];
    else if (entry.before === undefined) [status, body] = ["A", entry.after ?? ""];
    else [status, body] = ["M", (entry.after ?? "") + (entry.before ?? "")];
    return { path: p, status, insertions: body.split("\n").length - 1, deletions: 0, bytes: Buffer.byteLength(body) };
  });
}

const pathOf = (x) => (typeof x === "string" ? x : x?.path);

// Secret and oversized files stay in reach: a secret becomes a finding by name,
// an oversized one is reviewed by hunks.
export function checkSelection(name, spec, selector) {
  const files = spec.fixture?.files;
  if (!files || typeof files !== "object" || !Object.keys(files).length) return [];
  const r = spawnSync(process.execPath, [selector], { input: JSON.stringify(selectorRecords(files)), encoding: "utf8" });
  if (r.status !== 0) return [`${name}: select-files.mjs exited ${r.status}: ${(r.stderr || "").trim().slice(0, 200)}`];
  let out;
  try {
    out = JSON.parse(r.stdout);
  } catch {
    return [`${name}: select-files.mjs printed invalid JSON`];
  }
  const reachable = new Set([...(out.reviewable ?? []), ...(out.secrets ?? []), ...(out.oversized ?? [])].map(pathOf));
  const excluded = new Map((out.excluded ?? []).map((x) => [pathOf(x), x?.reason]));
  const stem = name.replace(/\.json$/, "");
  const errors = [];
  if (!reachable.size && !EMPTY_DIFF_ALLOWLIST.has(stem)) {
    errors.push(`${name}: file selection excludes every fixture file (${[...new Set(excluded.values())].join(", ")}): no reviewer can see this case`);
  }
  for (const want of spec.success_criteria?.must_detect ?? []) {
    const target = want?.file;
    if (!target || !(target in files) || reachable.has(target)) continue;
    errors.push(`${name}: must_detect targets '${target}' but selection excludes it (reason: ${excluded.get(target) ?? "not in output"}): the planted defect is unreachable`);
  }
  return errors;
}

export function validateDir(dir, selector = DEFAULT_SELECTOR) {
  const haveSelector = fs.existsSync(selector);
  const errors = [];
  const warnings = haveSelector ? [] : ["scripts/select-files.mjs absent: selection guard skipped"];
  let n = 0;
  let nSel = 0;
  for (const file of listCaseFiles(dir)) {
    n++;
    const r = validateCase(file);
    errors.push(...r.errors);
    warnings.push(...r.warnings);
    if (haveSelector && !r.errors.length) {
      errors.push(...checkSelection(path.basename(file), r.spec, selector));
      nSel++;
    }
  }
  return { errors, warnings, n, nSel };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dir = process.argv[2] ?? HERE;
  if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) {
    console.error(`validate: no such dir: ${dir}`);
    process.exit(2);
  }
  const { errors, warnings, n, nSel } = validateDir(dir);
  for (const w of warnings) console.log(`WARN  ${w}`);
  for (const e of errors) console.log(`ERROR ${e}`);
  if (errors.length) {
    console.log(`validate: ${errors.length} error(s) across ${n} case(s)`);
    process.exit(1);
  }
  console.log(`validate: ${n} case(s) valid${warnings.length ? `, ${warnings.length} warning(s)` : ""}; selection guard checked ${nSel} case(s)`);
}
