#!/usr/bin/env node
// Turns an eval case's fixture into a throwaway git repo: "before" is committed,
// "after" is written and staged (`git add -A`), so /review:review sees it as the
// uncommitted change. Staging, not intent-to-add, gives new files real blobs.
//
// fixture.kind "synthetic-diff":
//   files{path:{before?, after?, delete?}}: omit "after" for an unchanged file,
//     omit "before" for an added one, delete:true (with a "before") removes it.
//   rename_only + files_changed=N: N files whose one symbol is renamed.
//
// Usage: node evals/materialize.mjs CASE.json [DEST_DIR]   (prints the repo path)
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

function git(repo, ...args) {
  const r = spawnSync("git", ["-C", repo, ...args], { encoding: "utf8" });
  if (r.status !== 0) throw new Error(`git ${args.join(" ")} failed: ${r.stderr || r.error}`);
}

function write(repo, rel, content) {
  const file = path.join(repo, rel);
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

export function materialize(spec, dest) {
  const fx = spec.fixture ?? {};
  const repo = dest ?? fs.mkdtempSync(path.join(os.tmpdir(), "review-eval-"));
  fs.mkdirSync(repo, { recursive: true });

  git(repo, "init", "-q");
  git(repo, "config", "user.email", "eval@example.com");
  git(repo, "config", "user.name", "review-eval");
  git(repo, "config", "core.autocrlf", "false");
  git(repo, "config", "commit.gpgsign", "false");

  if (fx.kind === "real-commit") {
    // The commit that introduced a real bug, as an uncommitted change on top of its parent.
    git(repo, "fetch", "-q", "--no-tags", fx.repo, fx.commit);
    git(repo, "checkout", "-q", "FETCH_HEAD~1");
    git(repo, "checkout", "-q", "-b", "review");
    git(repo, "cherry-pick", "-n", "--allow-empty", "FETCH_HEAD");
    return repo;
  }
  if (fx.files && Object.keys(fx.files).length) {
    for (const [rel, entry] of Object.entries(fx.files)) {
      if ("before" in entry) write(repo, rel, entry.before);
    }
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "baseline", "--allow-empty");
    for (const [rel, entry] of Object.entries(fx.files)) {
      if (entry.delete) fs.rmSync(path.join(repo, rel), { force: true });
      else if ("after" in entry) write(repo, rel, entry.after);
    }
  } else if (fx.rename_only && fx.files_changed) {
    const n = Number(fx.files_changed);
    for (let i = 0; i < n; i++) write(repo, `src/mod_${i}.js`, `export function oldName_${i}(x) { return x + ${i}; }\n`);
    git(repo, "add", "-A");
    git(repo, "commit", "-q", "-m", "baseline");
    for (let i = 0; i < n; i++) write(repo, `src/mod_${i}.js`, `export function newName_${i}(x) { return x + ${i}; }\n`);
  } else {
    const err = new Error("materialize: unsupported fixture kind/shape");
    err.code = "UNSUPPORTED";
    throw err;
  }

  git(repo, "add", "-A");
  return repo;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [file, dest] = process.argv.slice(2);
  if (!file) {
    console.error("usage: node evals/materialize.mjs CASE.json [DEST_DIR]");
    process.exit(2);
  }
  try {
    console.log(materialize(JSON.parse(fs.readFileSync(file, "utf8")), dest));
  } catch (e) {
    console.error(e.message);
    process.exit(e.code === "UNSUPPORTED" ? 3 : 1);
  }
}
