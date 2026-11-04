import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { validateCase, validateDir, checkSelection } from "../evals/validate.mjs";

const EVALS = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "evals");

const good = (id = "01-x") => ({
  id,
  skill: "review",
  query: "/review:review",
  fixture: { kind: "synthetic-diff", files: { "a.js": { before: "x\n", after: "y\n" } } },
  success_criteria: { must_detect: [{ file: "a.js", verdict: "confirmed" }] },
  grader: { method: "llm-rubric", rubric: "PASS if it flags a.js." },
});

function check(spec, name = `${spec.id ?? "01-x"}.json`) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-val-"));
  try {
    const file = path.join(dir, name);
    fs.writeFileSync(file, typeof spec === "string" ? spec : JSON.stringify(spec));
    return validateCase(file);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

const hasError = (r, re) => r.errors.some((e) => re.test(e));

test("the real suite is valid", () => {
  const { errors, n } = validateDir(EVALS);
  assert.deepEqual(errors, []);
  assert.equal(n, 95);
});

test("a good case passes", () => {
  assert.deepEqual(check(good()).errors, []);
});

test("a missing rubric fails", () => {
  const spec = good();
  spec.grader.rubric = " ";
  assert.ok(hasError(check(spec), /rubric/));
});

test("an id that differs from the file name fails", () => {
  assert.ok(hasError(check(good(), "02-y.json"), /filename stem/));
});

test("the old invocation fails", () => {
  const spec = good();
  spec.query = "/review-all";
  spec.skill = "review-all";
  const r = check(spec);
  assert.ok(hasError(r, /query/));
  assert.ok(hasError(r, /skill/));
  assert.ok(hasError(r, /review-all/));
});

test("cut fixture fields fail", () => {
  const spec = good();
  spec.fixture.seed_profile_cache = { rules: "x" };
  assert.ok(hasError(check(spec), /seed_profile_cache/));
});

test("an unknown verdict fails", () => {
  const spec = good();
  spec.success_criteria.must_detect[0].verdict = "keep";
  assert.ok(hasError(check(spec), /verdict/));
});

test("an unsupported fixture kind fails", () => {
  const spec = good();
  spec.fixture.kind = "real-repo";
  assert.ok(hasError(check(spec), /fixture.kind/));
});

test("an empty diff fails unless it is the allowlisted no-op", () => {
  const spec = good();
  spec.fixture.files = { "a.js": { before: "x\n" } };
  assert.ok(hasError(check(spec), /empty diff/));
  const noop = { ...good("04-empty-diff-noop"), fixture: spec.fixture };
  assert.deepEqual(check(noop).errors, []);
});

test("delete without before fails", () => {
  const spec = good();
  spec.fixture.files = { "a.js": { delete: true } };
  assert.ok(hasError(check(spec), /delete:true/));
});

test("rename_only needs an integer count", () => {
  const spec = good();
  spec.fixture = { kind: "synthetic-diff", rename_only: true, files_changed: "3" };
  assert.ok(hasError(check(spec), /files_changed/));
});

test("invalid JSON fails", () => {
  assert.ok(hasError(check("{not json", "01-x.json"), /not valid JSON/));
});

test("a must_detect file that selection excludes fails", () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cr-sel-"));
  try {
    const selector = path.join(dir, "select.mjs");
    fs.writeFileSync(
      selector,
      `let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const r=JSON.parse(s);` +
        `console.log(JSON.stringify({reviewable:r.filter(x=>x.path!=="a.js"),excluded:[{path:"a.js",reason:"generated"}],secrets:[],oversized:[]}))});`,
    );
    const spec = good();
    spec.fixture.files["b.js"] = { after: "z\n" };
    const errors = checkSelection("01-x.json", spec, selector);
    assert.equal(errors.length, 1);
    assert.match(errors[0], /a\.js.*generated/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
