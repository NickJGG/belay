import assert from "node:assert/strict";
import { test } from "node:test";
import { extensionCard, glowRow } from "../settings.ts";

test("an extension's Off locks while it's on and one of its sessions is attached, naming them", () => {
  assert.deepEqual(extensionCard({ id: "grill", on: true, attached: [] }), { locked: false, inUse: [] });
  assert.deepEqual(extensionCard({ id: "grill", on: true, attached: ["a", "b"] }), { locked: true, inUse: ["a", "b"] });
  assert.deepEqual(extensionCard({ id: "learn", on: false, attached: ["a"] }), { locked: false, inUse: [] });
});

test("Glow greys out in the light theme only", () => {
  assert.equal(glowRow("light").disabled, true);
  assert.equal(glowRow("light").what, "Dark theme only.");
  assert.equal(glowRow("dark").disabled, false);
  assert.equal(glowRow(undefined).disabled, false);
});
