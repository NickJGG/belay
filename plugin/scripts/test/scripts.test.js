import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { renderMd } from "../render-md.js";
import { context, decisions, validate } from "../session.js";

const P = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const run = (script, args, opts = {}) => spawnSync(process.execPath, [path.join(P, script), ...args], { encoding: "utf8", ...opts });

const fixture = () => ({
  slug: "card-actions",
  topic: "Card actions: where they sit",
  status: "in-progress",
  project: "TOPO",
  started: "2026-10-23",
  updated: "2026-10-23",
  open: "Q2: icon style.",
  mock: { page: "existing", floor: 1280, screen: "page", currentControls: ["auth"], appCss: false, data: false, fonts: [] },
  questions: [
    {
      n: 1, title: "Where do a card's actions sit?", short: "Card actions", status: "resolved", rec: "b", pick: "b1",
      answer: "b1. Under the title,\nbut grey.",
      opts: [
        { key: "a", name: "None", expl: "On the story page.", patch: { actions: "none" } },
        { key: "b", name: "Under the title", expl: "Under each title.", patch: { actions: "row" } },
        { key: "b1", name: "Under the title, grey", expl: "Greyed.", from: "b", yours: true, patch: { actions: "row", grey: true } },
      ],
      mock: { controls: ["auth"] },
    },
    {
      n: 2, title: "Icons or words?", short: "Icon style", status: "open", rec: "a", pick: null, answer: null,
      opts: [{ key: "a", name: "Icons", expl: "Icons only.", patch: { icons: true } }],
      mock: { controls: ["auth"], starts: { auth: "out" }, requires: { actions: "row" } },
    },
    { n: 3, title: "Ship behind a flag?", status: "deferred", answer: "Deferred to the plan." },
  ],
});

const tmpSession = (s) => {
  const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "sear-")), s.slug);
  fs.mkdirSync(dir);
  fs.writeFileSync(path.join(dir, "session.json"), JSON.stringify(s, null, 2));
  return dir;
};

test("renders grill's markdown shape", () => {
  const md = renderMd(fixture());
  assert.equal(
    md,
    `---
slug: card-actions
topic: "Card actions: where they sit"
status: in-progress
project: TOPO
started: 2026-10-23
updated: 2026-10-23
---

# Grill session: card-actions

## Topic
Card actions: where they sit

## Resolved

- **Q:** Where do a card's actions sit? (a None · b Under the title)
  **A:** b1. Under the title,
  but grey. Previewed (Q1).

- **Q:** Ship behind a flag?
  **A:** Deferred to the plan.

## Open
Q2: icon style.
`,
  );
});

test("an existing grill session's headings and Q/A lines match the rendered ones", () => {
  const grill = path.join(os.homedir(), ".claude", "skills", "grill", "sessions", "grill-preview-bridge", "grill-preview-bridge.md");
  if (!fs.existsSync(grill)) return;
  const shape = (md) => md.split(/\r?\n/).map((l) => /^(---|# Grill session:|## \w+|- \*\*Q:\*\*|  \*\*A:\*\*|[a-z]+:)/.exec(l)?.[1]).filter(Boolean);
  const old = new Set(shape(fs.readFileSync(grill, "utf8")));
  for (const line of shape(renderMd(fixture()))) assert.ok(old.has(line), `rendered line kind ${line} not in a grill session`);
});

test("render-md writes the file, or reports problems and writes nothing", () => {
  const dir = tmpSession(fixture());
  const ok = run("scripts/render-md.js", [dir]);
  assert.equal(ok.stdout.trim(), "ok");
  assert.match(fs.readFileSync(path.join(dir, "card-actions.md"), "utf8"), /^# Grill session: card-actions$/m);

  const bad = fixture();
  bad.questions[1].pick = "z";
  const badDir = tmpSession(bad);
  const r = run("scripts/render-md.js", [badDir]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /Q2.*pick "z" isn't one of its options/);
  assert.ok(!fs.existsSync(path.join(badDir, "card-actions.md")));
});

test("validate catches the common slips", () => {
  const s = fixture();
  s.questions[0].pick = null;
  s.questions[2].answer = null;
  s.questions.push({ n: 2, title: "dup", status: "open" });
  const p = validate(s).join("\n");
  assert.match(p, /Q1.*resolved with options but no pick/);
  assert.match(p, /Q3.*deferred but no answer digest/);
  assert.match(p, /duplicate n/);
  assert.deepEqual(validate(fixture(), "/x/card-actions"), []);
  assert.match(validate(fixture(), "/x/other").join(), /doesn't match the folder name/);
});

test("decisions apply picks, then requires, then the option", () => {
  const s = fixture();
  const base = { actions: "none", icons: false };
  assert.deepEqual(decisions(s, base, { today: true }), base);
  assert.deepEqual(decisions(s, base), { actions: "row", icons: false, grey: true });
  assert.deepEqual(decisions(s, base, { n: 1, opt: "a" }), { actions: "none", icons: false });
  assert.deepEqual(decisions(s, base, { n: 2, opt: null }), { actions: "row", icons: false, grey: true });
  assert.deepEqual(decisions(s, base, { n: 2, opt: "a" }), { actions: "row", icons: true, grey: true });
  const controls = { auth: { def: "in", items: [["in"], ["out"]] } };
  assert.deepEqual(context(controls, s.questions[1], { phone: true }), { auth: "out", phone: true, q: 2 });
  assert.deepEqual(context(controls, null), { auth: "in", phone: false, q: null });
});

test("check-preview passes the templates and catches a broken render", () => {
  const dir = tmpSession(fixture());
  fs.copyFileSync(path.join(P, "preview/spec-template.js"), path.join(dir, "preview.spec.js"));
  fs.copyFileSync(path.join(P, "preview/mock-template.css"), path.join(dir, "preview.mock.css"));
  const ok = run("preview/check-preview.js", [dir]);
  assert.equal(ok.stdout.trim(), "ok", ok.stdout + ok.stderr);

  const spec = path.join(dir, "preview.spec.js");
  fs.writeFileSync(spec, fs.readFileSync(spec, "utf8").replace("return `<div class=\"ex-page\">", "if (d.icons) throw new Error('boom');\n  return `<div class=\"ex-page\">"));
  const r = run("preview/check-preview.js", [dir]);
  assert.equal(r.status, 1);
  assert.match(r.stdout, /^Q2 a: boom$/m);
  assert.match(r.stdout, /^Q2 a \(phone\): boom$/m);

  fs.writeFileSync(path.join(dir, "preview.app.css"), ".ex-page{}");
  const s = fixture();
  s.mock.appCss = true;
  s.questions[0].mock.controls = ["nope"];
  fs.writeFileSync(path.join(dir, "session.json"), JSON.stringify(s));
  const r2 = run("preview/check-preview.js", [dir]);
  assert.match(r2.stdout, /Q1: unknown control nope/);
});

test("log-chat appends terminal-side entries", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "sear-"));
  const env = { ...process.env, SEAR_SESSIONS_DIR: root };
  assert.equal(run("scripts/log-chat.js", ["x-1", "terminal"], { env, input: "b, but grey\n" }).status, 0);
  assert.equal(run("scripts/log-chat.js", ["x-1", "claude"], { env, input: "Q2 · Icons or words?" }).status, 0);
  assert.equal(run("scripts/log-chat.js", ["../x", "claude"], { env, input: "x" }).status, 2);
  const lines = fs.readFileSync(path.join(root, "x-1", "chat.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(lines.map(({ at, ...e }) => e), [
    { from: "terminal", kind: "chat", text: "b, but grey" },
    { from: "claude", kind: "terminal", text: "Q2 · Icons or words?" },
  ]);
  assert.ok(lines.every((e) => !Number.isNaN(Date.parse(e.at))));
});
