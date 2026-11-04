import assert from "node:assert/strict";
import { test } from "node:test";
import { siteDescription } from "../extensions.ts";

test("siteDescription: names what the active extensions add, in built-in order", () => {
  assert.equal(siteDescription(["grill", "learn"]), "Projects, grills and courses, worked through Claude Code sessions.");
  assert.equal(siteDescription(["learn", "grill"]), "Projects, grills and courses, worked through Claude Code sessions.");
  assert.equal(siteDescription(["learn"]), "Projects and courses, worked through Claude Code sessions.");
  assert.equal(siteDescription(["grill", "learn", "review"]), "Projects, grills, courses and reviews, worked through Claude Code sessions.");
  assert.equal(siteDescription([]), "Projects, worked through Claude Code sessions.");
});
