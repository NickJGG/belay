import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { focusTab, SCRIPT, type Run } from "../focus.mts";

const runner = (code: number, stdout = "") => {
  const calls: string[][] = [];
  const run: Run = async (args) => {
    calls.push(args);
    return { code, stdout };
  };
  return { run, calls };
};

test("runs the script with Claude's pid and the session's transcript; exit 0 is success", async () => {
  const { run, calls } = runner(0);
  assert.equal(await focusTab({ wt: true, claudePid: 42, id: "abc", dir: "/logs", run }), null);
  assert.deepEqual(calls[0].slice(-6), ["-File", SCRIPT, "-ClaudePid", "42", "-Transcript", path.join("/logs", "abc.jsonl")]);
});

test("without a transcript it still runs, by Claude's pid alone", async () => {
  const { run, calls } = runner(0);
  assert.equal(await focusTab({ wt: true, claudePid: 42, id: "abc", dir: null, run }), null);
  assert.deepEqual(calls[0].slice(-4), ["-File", SCRIPT, "-ClaudePid", "42"]);
});

test("a miss returns the script's reason, or a fallback when it printed none", async () => {
  const reason = 'No terminal tab is titled "x".';
  assert.equal(await focusTab({ wt: true, claudePid: 42, id: "abc", dir: "/logs", run: runner(3, `${reason}\r\n`).run }), reason);
  assert.equal(await focusTab({ wt: true, claudePid: 42, id: null, dir: null, run: runner(1).run }), "couldn't focus the terminal tab");
});

test("refuses outside Windows Terminal without running anything", async () => {
  const { run, calls } = runner(0);
  assert.equal(await focusTab({ wt: false, claudePid: 42, id: "abc", dir: "/logs", run }), "not in Windows Terminal");
  assert.equal(calls.length, 0);
});

test("the compiled bridge finds the script in the plugin", async () => {
  // test:bridge builds first; the plugin runs the compiled module, whose `../scripts` is plugin/scripts.
  const compiled = new URL("../../plugin/bridge/focus.mjs", import.meta.url).href;
  const { SCRIPT: shipped } = (await import(compiled)) as { SCRIPT: string };
  assert.ok(existsSync(shipped), shipped);
});
