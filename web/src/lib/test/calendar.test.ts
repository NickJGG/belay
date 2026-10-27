import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { dayLabel, forecast, monthGrid, monthOf, monthTitle, shiftMonth } from "../calendar.ts";

describe("course calendar", () => {
  test("the grid starts on Sunday with blanks before the 1st", () => {
    const oct = monthGrid({ year: 2026, month: 9 });
    assert.deepEqual(oct.slice(0, 5), [null, null, null, null, "2026-10-01"]);
    assert.equal(oct.length, 4 + 31);
    assert.equal(oct.at(-1), "2026-10-31");
    assert.equal(monthGrid({ year: 2026, month: 1 }).filter(Boolean).length, 28);
    assert.equal(monthGrid({ year: 2026, month: 10 })[0], "2026-11-01");
  });

  test("months shift across years", () => {
    assert.deepEqual(monthOf("2026-10-26"), { year: 2026, month: 9 });
    assert.deepEqual(shiftMonth({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 });
    assert.deepEqual(shiftMonth({ year: 2026, month: 0 }, -1), { year: 2025, month: 11 });
    assert.equal(monthTitle({ year: 2026, month: 9 }, "2026-10-26"), "October");
    assert.equal(monthTitle({ year: 2027, month: 0 }, "2026-10-26"), "January 2027");
  });

  test("days read Today, Tomorrow or a short date", () => {
    assert.equal(dayLabel("2026-10-26", "2026-10-26"), "Today");
    assert.equal(dayLabel("2026-10-27", "2026-10-26"), "Tomorrow");
    assert.equal(dayLabel("2026-11-01", "2026-10-31"), "Tomorrow");
    assert.equal(dayLabel("2026-10-20", "2026-10-26"), "Tue 20 Oct");
  });

  test("the forecast counts cards per day, overdue ones on today", () => {
    assert.deepEqual(forecast(["2026-10-20", "2026-10-26", "2026-10-27", "2026-10-27"], "2026-10-26"), {
      "2026-10-26": 2,
      "2026-10-27": 2,
    });
  });
});
