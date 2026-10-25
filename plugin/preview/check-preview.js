#!/usr/bin/env node
/* Checks a Sear session's mocks: usage `node check-preview.js <session dir>`.
   1. session.json is valid, and its mock flags match the files present.
   2. Syntax-checks preview.spec.js and, if present, preview.data.js.
   3. Runs them, checks CONTROLS / BASE / renderScreen / route, and that every control a question names exists.
   4. Renders every view (Today, Current design, each mocked question's Before and options; desktop and phone).
   5. If preview.app.css exists, lists class names the spec uses that no CSS defines.
   Prints `ok` when nothing is wrong; exits 1 otherwise. */
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { spawnSync } from "node:child_process";
import { context, decisions, readSession, validate } from "../scripts/session.js";

const dir = process.argv[2];
if (!dir) {
  console.log("usage: node check-preview.js <session dir>");
  process.exit(2);
}
const f = (name) => path.join(dir, name);
const has = (name) => fs.existsSync(f(name));
// Classes the Sear stage defines around every mock.
const STAGE_CLASSES = new Set(["pv-undecided"]);
const problems = [];
const done = () => {
  console.log(problems.length ? problems.join("\n") : "ok");
  process.exit(problems.length ? 1 : 0);
};

let s;
try {
  s = readSession(dir);
  problems.push(...validate(s, path.resolve(dir)));
} catch (err) {
  problems.push(err.message);
  done();
}
if (!s.mock) {
  if (has("preview.spec.js")) problems.push("preview.spec.js exists but session.json has mock: null");
  done();
}
if (!!s.mock.appCss !== has("preview.app.css")) problems.push(`mock.appCss is ${!!s.mock.appCss} but preview.app.css ${has("preview.app.css") ? "exists" : "is missing"}`);
if (!!s.mock.data !== has("preview.data.js")) problems.push(`mock.data is ${!!s.mock.data} but preview.data.js ${has("preview.data.js") ? "exists" : "is missing"}`);
if (!has("preview.mock.css")) problems.push("preview.mock.css: missing");

for (const name of ["preview.data.js", "preview.spec.js"]) {
  if (!has(name)) {
    if (name === "preview.spec.js") problems.push(`${name}: missing`);
    continue;
  }
  const r = spawnSync(process.execPath, ["--check", f(name)], { encoding: "utf8" });
  if (r.status !== 0) {
    const lines = r.stderr.split(/\r?\n/);
    const where = lines.find((l) => /:\d+$/.test(l)) || name;
    const err = lines.find((l) => /^\w*Error\b/.test(l)) || lines.find(Boolean) || "syntax error";
    problems.push(`${path.basename(where)}: ${err}`);
  }
}
if (problems.length) done();

// The spec's top-level const/function names live in the context's global lexical scope, which a later script can read.
const sandbox = vm.createContext({});
sandbox.window = sandbox;
let spec;
try {
  for (const name of ["preview.data.js", "preview.spec.js"]) {
    if (has(name)) vm.runInContext(fs.readFileSync(f(name), "utf8"), sandbox, { filename: name, timeout: 2000 });
  }
  spec = vm.runInContext(
    `({ CONTROLS: typeof CONTROLS === 'undefined' ? undefined : CONTROLS, BASE: typeof BASE === 'undefined' ? undefined : BASE,
        renderScreen: typeof renderScreen === 'undefined' ? undefined : renderScreen, route: typeof route === 'undefined' ? undefined : route })`,
    sandbox,
  );
} catch (err) {
  problems.push(`running the spec: ${err.message}`);
  done();
}
const isObj = (v) => typeof v === "object" && v !== null && !Array.isArray(v);
if (!isObj(spec.CONTROLS)) problems.push("preview.spec.js: CONTROLS must be an object");
if (!isObj(spec.BASE)) problems.push("preview.spec.js: BASE must be an object");
if (typeof spec.renderScreen !== "function") problems.push("preview.spec.js: renderScreen must be a function");
if (typeof spec.route !== "function") problems.push("preview.spec.js: route must be a function");
if (problems.length) done();

for (const [k, c] of Object.entries(spec.CONTROLS)) {
  if (!Array.isArray(c?.items) || !c.items.some(([v]) => v === c.def)) problems.push(`CONTROLS.${k}: def must be one of its items`);
}
const checkControls = (where, keys = [], values = {}) => {
  for (const k of keys) if (!spec.CONTROLS[k]) problems.push(`${where}: unknown control ${k}`);
  for (const [k, v] of Object.entries(values)) {
    const c = spec.CONTROLS[k];
    if (c && !c.items.some(([x]) => x === v)) problems.push(`${where}: ${k}=${JSON.stringify(v)} isn't one of its items`);
  }
};
checkControls("mock.currentControls", s.mock.currentControls);
const mocked = s.questions.filter((q) => q.mock);
for (const q of mocked) checkControls(`Q${q.n}`, q.mock.controls, { ...q.mock.starts, ...q.mock.fixed });

const rendered = [];
const render = (label, d, q) => {
  for (const phone of [false, true]) {
    const ctx = context(spec.CONTROLS, q, { phone });
    const at = `${label}${phone ? " (phone)" : ""}`;
    try {
      const html = spec.renderScreen(d, ctx);
      if (typeof html !== "string") problems.push(`${at}: renderScreen returned ${typeof html}, not HTML`);
      else rendered.push(html);
      if (typeof spec.route(d, ctx) !== "string") problems.push(`${at}: route didn't return a string`);
    } catch (err) {
      problems.push(`${at}: ${err.message}`);
    }
  }
};
if (s.mock.page === "existing") render("Today", decisions(s, spec.BASE, { today: true }), null);
render("Current design", decisions(s, spec.BASE), null);
for (const q of mocked) {
  render(`Q${q.n} Before`, decisions(s, spec.BASE, { n: q.n }), q);
  for (const o of q.opts ?? []) render(`Q${q.n} ${o.key}`, decisions(s, spec.BASE, { n: q.n, opt: o.key }), q);
}

if (has("preview.app.css")) {
  const defined = new Set(STAGE_CLASSES);
  for (const name of ["preview.app.css", "preview.mock.css"]) {
    if (!has(name)) continue;
    const css = fs.readFileSync(f(name), "utf8")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/url\([^)]*\)/g, "")
      .replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, "");
    for (const m of css.matchAll(/\.((?:[_a-zA-Z-]|\\.)(?:[\w-]|\\.)*)/g)) defined.add(m[1].replace(/\\(.)/g, "$1"));
  }
  const used = new Set();
  const src = fs.readFileSync(f("preview.spec.js"), "utf8").replace(/\$\{[^}]*\}/g, " ");
  for (const text of [src, ...rendered]) {
    for (const m of text.matchAll(/class=(["'])([\s\S]*?)\1/g)) for (const c of m[2].split(/\s+/)) if (/^[\w-]+$/.test(c)) used.add(c);
  }
  const missing = [...used].filter((c) => !defined.has(c));
  if (missing.length) problems.push(`unknown classes: ${missing.join(" ")}`);
}

done();
