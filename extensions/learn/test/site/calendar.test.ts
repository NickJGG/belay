import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { dayLabel, forecast, monthGrid, monthOf, monthTitle, shiftMonth } from "../../web/_lib/calendar.ts";
import { calendarSessions, mergeDue } from "../../web/_lib/course-home.ts";

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

describe("calendar entries", () => {
  const sd = { slug: "system-design", title: "System design", hue: "teal" };
  const ci = { slug: "coding-interviews", title: "Coding interviews", hue: "amber" };
  const session = { date: "2026-10-27", time: null, topics: [], quiz: null, cardsReviewed: null, cardsAdded: null, ended: "complete" as const };

  test("sessions map to calendar entries, titled by topic, tagged with their course when given", () => {
    const sessions = [
      { ...session, kind: "full", topics: ["caching", "queues"], quiz: "4/5", cardsAdded: 3 },
      { ...session, kind: "review", ended: "early" as const },
      { ...session, kind: "checkpoint" },
    ];
    const titles = { caching: "Caching" };
    assert.deepEqual(calendarSessions({ titles }, sessions), [
      { date: "2026-10-27", kind: "Lesson", title: "Caching, queues", quiz: "4/5", cardsAdded: 3, early: false },
      { date: "2026-10-27", kind: "Review", title: "Review", quiz: null, cardsAdded: null, early: true },
      { date: "2026-10-27", kind: "Checkpoint", title: "Checkpoint", quiz: null, cardsAdded: null, early: false },
    ]);
    assert.deepEqual(calendarSessions({ titles }, sessions.slice(0, 1), sd)[0].course, sd);
  });

  test("forecasts merge by day, one entry per course in the order given", () => {
    assert.deepEqual(
      mergeDue([
        { course: sd, forecast: { "2026-10-27": 6, "2026-10-28": 2 } },
        { course: ci, forecast: { "2026-10-27": 4 } },
      ]),
      { "2026-10-27": [{ course: sd, n: 6 }, { course: ci, n: 4 }], "2026-10-28": [{ course: sd, n: 2 }] },
    );
    assert.deepEqual(mergeDue([{ forecast: { "2026-10-27": 3 } }]), { "2026-10-27": [{ n: 3 }] });
  });
});
