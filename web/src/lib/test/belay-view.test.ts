import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { dayLabel, flightGrills, flightWhy, grillStanding, kindTotals, projectGroups, shortDay, windowDays } from "../belay-view.ts";
import { belayIgnored, belayWatched } from "../watch-paths.ts";

test("day labels are relative to today, with the year only when it differs", () => {
  assert.equal(dayLabel("2026-10-25", "2026-10-25"), "Today");
  assert.equal(dayLabel("2026-10-24", "2026-10-25"), "Yesterday");
  assert.equal(dayLabel("2026-10-23", "2026-10-25"), "Fri, Oct 23");
  assert.equal(dayLabel("2025-12-31", "2026-01-02"), "Wed, Dec 31, 2025");
  assert.equal(shortDay("2026-10-21", "2026-10-25"), "Wed");
  assert.equal(shortDay("2026-10-01", "2026-10-25"), "Oct 1");
});

test("the Activity window is whole weeks, one to fifty-two", () => {
  assert.equal(windowDays(undefined), 7);
  assert.equal(windowDays("nonsense"), 7);
  assert.equal(windowDays("14"), 14);
  assert.equal(windowDays("20"), 14);
  assert.equal(windowDays("10000"), 364);
});

test("kind totals sum counts per kind, an entry without a count being one", () => {
  assert.equal(kindTotals([{ kind: "applied", count: 3 }, { kind: "outreach" }, { kind: "applied" }, {}]), "4 applied · 1 outreach");
  assert.equal(kindTotals([{}]), "");
});

test("a grill row says where it stands", () => {
  const base = { live: false, status: "in-progress", stage: "grilling" as const };
  assert.equal(grillStanding({ ...base, live: true }), "your turn");
  assert.equal(grillStanding({ ...base, live: true, working: true }), "Claude is working…");
  assert.equal(grillStanding({ ...base, questions: 16 }), "16 questions");
  assert.equal(grillStanding({ ...base, questions: 1 }), "1 question");
  assert.equal(grillStanding(base), "started");
  const planned = { live: false, status: "planned" };
  assert.equal(grillStanding({ ...planned, stage: "building", progress: { done: 0, total: 1 }, next: { id: "SEAR-7" } }), "SEAR-7 · 0/1");
  assert.equal(grillStanding({ ...planned, stage: "shipped", progress: { done: 3, total: 3 } }), "✓ 3 issues");
  assert.equal(grillStanding({ ...planned, stage: "shipped" }), "✓ no issues");
  assert.equal(grillStanding({ live: false, status: "abandoned", stage: "shipped" }), "abandoned");
});

test("projects group into Working on, Everything else, then paused and archived", () => {
  const p = (key: string, status: string, focus: boolean, open: number) => ({ key, status, focus, open });
  const { working, rest, shelved } = projectGroups([
    p("FOC", "active", true, 0),
    p("OPN", "active", false, 2),
    p("IDL", "active", false, 0),
    p("PAU", "paused", true, 4),
    p("ARC", "archived", false, 0),
  ]);
  assert.deepEqual(working.map((x) => x.key), ["FOC", "OPN"]);
  assert.deepEqual(rest.map((x) => x.key), ["IDL"]);
  assert.deepEqual(shelved.map((x) => x.key), ["PAU", "ARC"]);
});

test("belay's watcher sees issues, projects, log days and order.yaml, in either separator", () => {
  const root = path.join("C:", "data");
  const slash = (p: string) => p.replaceAll("\\", "/");
  for (const form of [(p: string) => p, slash]) {
    const at = (...parts: string[]) => form(path.join(root, ...parts));
    assert.equal(belayWatched(root, at("issues", "sear-1.md")), true);
    assert.equal(belayWatched(root, at("projects", "sear.md")), true);
    assert.equal(belayWatched(root, at("log", "2026-10-25.yaml")), true);
    assert.equal(belayWatched(root, at("order.yaml")), true);
    assert.equal(belayWatched(root, at("issues", "sear-1.md.123.tmp")), false);
    assert.equal(belayWatched(root, at("cache", "issues.json")), false);
    assert.equal(belayIgnored(root)(form(root)), false);
    assert.equal(belayIgnored(root)(at("issues")), false);
    assert.equal(belayIgnored(root)(at(".git")), true);
    assert.equal(belayIgnored(root)(at("settings.yaml")), true);
  }
});

test("an In flight row says idle or doing, a live grill's turn, else its open question", () => {
  const issue = { kind: "issue" as const, id: "SEAR-7", title: "t", project: "SEAR" };
  assert.equal(flightWhy(issue), "doing");
  assert.equal(flightWhy({ ...issue, idleDays: 4 }), "idle 4 days");
  const grill = { kind: "grill" as const, slug: "g", topic: "t", live: false };
  assert.equal(flightWhy({ ...grill, live: true }), "live · your turn");
  assert.equal(flightWhy({ ...grill, live: true, working: true, openQ: 3 }), "live · Claude is working…");
  assert.equal(flightWhy({ ...grill, openQ: 3 }), "Q3 open");
  assert.equal(flightWhy({ ...grill, questions: 2 }), "2 questions");
  assert.equal(flightWhy(grill), "started");
});

test("live grills lead In flight, once each, untagged ones included", () => {
  const g = (slug: string) => ({ slug });
  assert.deepEqual(flightGrills([g("a"), g("b"), g("c")], [g("c"), g("z")]).map((x) => x.slug), ["c", "z", "a", "b"]);
  assert.deepEqual(flightGrills([g("a")], []).map((x) => x.slug), ["a"]);
});
