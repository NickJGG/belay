import assert from "node:assert/strict";
import { test } from "node:test";
import { relativeDue } from "../format.ts";

test("due dates read relative to today", () => {
  assert.equal(relativeDue("2026-10-23", "2026-10-25"), "overdue 2 days");
  assert.equal(relativeDue("2026-10-24", "2026-10-25"), "overdue 1 day");
  assert.equal(relativeDue("2026-10-25", "2026-10-25"), "today");
  assert.equal(relativeDue("2026-10-26", "2026-10-25"), "tomorrow");
  assert.equal(relativeDue("2026-10-31", "2026-10-25"), "in 6 days");
});
