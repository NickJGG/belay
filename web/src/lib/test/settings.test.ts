import assert from "node:assert/strict";
import { test } from "node:test";
import { extensionCard, glowRow, jobIdle, jobLine, type ExtensionJob, type ExtensionState } from "../settings.ts";

const ext = (s: Partial<ExtensionState>): ExtensionState => ({
  id: "grill",
  name: "Grill",
  summary: "",
  mark: { path: "", dot: { x: 0, y: 0, r: 0 } },
  installed: true,
  on: true,
  attached: [],
  ...s,
});

test("an extension's Off locks while it's on and one of its sessions is attached, naming them", () => {
  assert.deepEqual(extensionCard(ext({})), { installed: true, locked: false, canUninstall: true, inUse: [], then: "Switch it off or uninstall it once that detaches." });
  const busy = extensionCard(ext({ attached: ["a", "b"] }));
  assert.equal(busy.locked, true);
  assert.deepEqual(busy.inUse, ["a", "b"]);
  const off = extensionCard(ext({ on: false, attached: ["a"] }));
  assert.equal(off.locked, false);
  assert.deepEqual(off.inUse, ["a"]);
  assert.equal(off.then, "Uninstall it once that detaches.");
});

test("Uninstall is refused while any of its sessions is attached, on or off", () => {
  assert.equal(extensionCard(ext({ attached: ["a"] })).canUninstall, false);
  assert.equal(extensionCard(ext({ on: false, attached: ["a"] })).canUninstall, false);
  assert.equal(extensionCard(ext({ on: false })).canUninstall, true);
});

test("an uninstalled extension offers neither its switch's lock nor Uninstall, and names no sessions", () => {
  assert.deepEqual(extensionCard(ext({ installed: false, attached: ["a"] })), {
    installed: false,
    locked: false,
    canUninstall: false,
    inUse: [],
    then: "Switch it off or uninstall it once that detaches.",
  });
});

test("a job's line names its step and counts, then what's next", () => {
  const base = { id: "learn", boot: "1" } as const;
  assert.equal(jobLine({ ...base, action: "install", state: "running", step: "dependencies", n: 1, of: 4 }), "Installing: dependencies (1 of 4)…");
  assert.equal(jobLine({ ...base, action: "uninstall", state: "running", step: "Claude Code plugin", n: 2, of: 4 }), "Uninstalling: Claude Code plugin (2 of 4)…");
  assert.equal(jobLine({ ...base, action: "install", state: "done", restarting: true }), "Installed. Belay is rebuilding; this page reloads when it's back.");
  assert.equal(jobLine({ ...base, action: "uninstall", state: "done", restarting: false }), "Uninstalled. Reloading…");
  assert.equal(jobLine({ ...base, action: "uninstall", state: "failed", error: "record: nope" }), "Couldn't uninstall: record: nope");
});

test("a new job waits for a running one and a restart", () => {
  const base = { id: "learn", action: "install", boot: "1" } as const;
  assert.equal(jobIdle(null), true);
  assert.equal(jobIdle({ ...base, state: "failed", error: "x" } as ExtensionJob), true);
  assert.equal(jobIdle({ ...base, state: "running", step: "record", n: 4, of: 4 }), false);
  assert.equal(jobIdle({ ...base, state: "done", restarting: false }), true);
  assert.equal(jobIdle({ ...base, state: "done", restarting: true }), false);
});

test("Glow greys out in the light theme only", () => {
  assert.equal(glowRow("light").disabled, true);
  assert.equal(glowRow("light").what, "Dark theme only.");
  assert.equal(glowRow("dark").disabled, false);
  assert.equal(glowRow(undefined).disabled, false);
});
