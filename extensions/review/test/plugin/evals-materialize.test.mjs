import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { materialize } from "../evals/materialize.mjs";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const git = (repo, ...args) => spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" }).stdout;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "cr-mat-"));
const fixture = (files) => ({ fixture: { kind: "synthetic-diff", files } });

function withRepo(spec, fn) {
  const repo = materialize(spec, tmp());
  try {
    fn(repo);
  } finally {
    fs.rmSync(repo, { recursive: true, force: true });
  }
}

test("before is committed and after is staged", () => {
  withRepo(fixture({ "a.js": { before: "x\n", after: "y\n" } }), (repo) => {
    assert.equal(git(repo, "log", "--format=%s"), "baseline\n");
    assert.match(git(repo, "diff", "--cached"), /-x\n\+y/);
    assert.equal(git(repo, "diff"), "");
  });
});

test("an added file is staged with its content", () => {
  withRepo(fixture({ "a.js": { before: "x\n" }, "src/b.js": { after: "new\n" } }), (repo) => {
    assert.equal(git(repo, "diff", "--cached", "--name-status").trim(), "A\tsrc/b.js");
    assert.match(git(repo, "diff", "--cached"), /\+new/);
  });
});

test("delete removes a baseline file", () => {
  withRepo(fixture({ "a.js": { before: "x\n" }, "gone.js": { before: "y\n", delete: true } }), (repo) => {
    assert.equal(git(repo, "diff", "--cached", "--name-status").trim(), "D\tgone.js");
  });
});

test("before-only files give a clean tree", () => {
  withRepo(fixture({ "a.js": { before: "x\n" } }), (repo) => {
    assert.equal(git(repo, "status", "--porcelain"), "");
  });
});

test("rename_only generates N renamed files", () => {
  withRepo({ fixture: { kind: "synthetic-diff", rename_only: true, files_changed: 3 } }, (repo) => {
    const changed = git(repo, "diff", "--cached", "--name-only").trim().split("\n");
    assert.deepEqual(changed, ["src/mod_0.js", "src/mod_1.js", "src/mod_2.js"]);
    assert.match(fs.readFileSync(path.join(repo, "src/mod_2.js"), "utf8"), /newName_2/);
  });
});

test("content is written byte for byte, without CRLF conversion", () => {
  withRepo(fixture({ "a.js": { before: "x\n", after: "one\ntwo\n" } }), (repo) => {
    assert.equal(fs.readFileSync(path.join(repo, "a.js"), "utf8"), "one\ntwo\n");
  });
});

test("the CLI prints the repo path and exits 3 on an unsupported shape", () => {
  const dir = tmp();
  try {
    const good = path.join(dir, "good.json");
    fs.writeFileSync(good, JSON.stringify(fixture({ "a.js": { before: "x\n", after: "y\n" } })));
    const dest = path.join(dir, "repo");
    const ok = spawnSync(process.execPath, [path.join(ROOT, "evals/materialize.mjs"), good, dest], { encoding: "utf8" });
    assert.equal(ok.status, 0);
    assert.equal(ok.stdout.trim(), dest);

    const bad = path.join(dir, "bad.json");
    fs.writeFileSync(bad, JSON.stringify({ fixture: { kind: "synthetic-diff" } }));
    const r = spawnSync(process.execPath, [path.join(ROOT, "evals/materialize.mjs"), bad, path.join(dir, "repo2")], { encoding: "utf8" });
    assert.equal(r.status, 3);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
