import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { terrain } from "../course-art.ts";
import { COLLAPSED_DEFAULTS, DRAWER_DEFAULTS, fresh, markSeen, missing, moveTab, orderTabs, pageKind, parseCollapsed, parseDrawer, parseGlow, parseOutline, parseSeen, parseTabOrder, selectTab, sessionSlug } from "../shell.ts";

describe("page kinds", () => {
  test("a grill page is a workspace; everything else reads", () => {
    assert.equal(pageKind("/s/one-grills-root"), "workspace");
    assert.equal(pageKind("/s/x/"), "workspace");
    for (const p of ["/", "/p", "/p/KILN", "/learn", "/nope"]) assert.equal(pageKind(p), "reading");
  });

  test("sessionSlug reads /s/<slug> only", () => {
    assert.equal(sessionSlug("/s/a-b"), "a-b");
    assert.equal(sessionSlug("/p/a-b"), null);
    assert.equal(sessionSlug("/s/"), null);
  });

  test("the sidebar remembers each kind, falling back per field", () => {
    assert.deepEqual(parseCollapsed(null), COLLAPSED_DEFAULTS);
    assert.deepEqual(parseCollapsed("not json"), COLLAPSED_DEFAULTS);
    assert.deepEqual(parseCollapsed('{"reading":true}'), { workspace: true, reading: true });
    assert.deepEqual(parseCollapsed('{"workspace":false,"reading":"x"}'), { workspace: false, reading: false });
  });

  test("a grill's Outline opens expanded unless a toggle stored false", () => {
    assert.equal(parseOutline(null), true);
    assert.equal(parseOutline("nope"), true);
    assert.equal(parseOutline('"false"'), true);
    assert.equal(parseOutline("false"), false);
    assert.equal(parseOutline("true"), true);
  });

  test("the glow is on unless a toggle stored false", () => {
    assert.equal(parseGlow(null), true);
    assert.equal(parseGlow("{}"), true);
    assert.equal(parseGlow("false"), false);
    assert.equal(parseGlow("true"), true);
  });
});

describe("selectTab", () => {
  test("the open page's grill wins while it's live", () => {
    assert.equal(selectTab(["a", "b"], "b", "a"), "b");
  });

  test("else the last pick while still live, else the first tab", () => {
    assert.equal(selectTab(["a", "b"], "c", "b"), "b");
    assert.equal(selectTab(["a", "b"], null, "gone"), "a");
    assert.equal(selectTab([], "a", "a"), null);
  });
});

describe("Tab order", () => {
  test("bad storage is no order", () => {
    assert.deepEqual(parseTabOrder(null), []);
    assert.deepEqual(parseTabOrder("not json"), []);
    assert.deepEqual(parseTabOrder('{"a":1}'), []);
    assert.deepEqual(parseTabOrder('["a",2,"b"]'), ["a", "b"]);
  });

  test("live Tabs follow the stored order; new ones land at the end", () => {
    assert.deepEqual(orderTabs(["a", "b", "c"], []), ["a", "b", "c"]);
    assert.deepEqual(orderTabs(["a", "new", "b", "c"], ["c", "a", "b"]), ["c", "a", "b", "new"]);
  });

  test("a move to the front, the end or the middle", () => {
    const live = ["a", "b", "c", "d"];
    assert.deepEqual(moveTab([], live, "c", 0), ["c", "a", "b", "d"]);
    assert.deepEqual(moveTab([], live, "a", 3), ["b", "c", "d", "a"]);
    assert.deepEqual(moveTab(["d", "c", "b", "a"], live, "a", 1), ["d", "a", "c", "b"]);
  });

  test("a Tab that drops out and comes back regains its place", () => {
    const saved = moveTab([], ["a", "x", "b"], "b", 0);
    assert.deepEqual(saved, ["b", "a", "x"]);
    const without = moveTab(saved, ["a", "b"], "a", 0);
    assert.deepEqual(without, ["a", "b", "x"]);
    assert.deepEqual(orderTabs(["a", "b", "x"], without), ["a", "b", "x"]);
    const kept = moveTab(["b", "x", "a"], ["a", "b"], "b", 1);
    assert.deepEqual(kept, ["a", "x", "b"]);
    assert.deepEqual(orderTabs(["b", "a", "x"], kept), ["a", "x", "b"]);
  });

  test("the cap drops the earliest stale slugs, never a live one", () => {
    const stale = Array.from({ length: 30 }, (_, i) => `s${i}`);
    const live = ["a", "b"];
    const out = moveTab([...stale, "a", "b"], live, "b", 0);
    assert.equal(out.length, 30);
    assert.deepEqual(out.slice(-2), ["b", "a"]);
    assert.equal(out[0], "s2");
    const many = Array.from({ length: 35 }, (_, i) => `l${i}`);
    assert.deepEqual(moveTab(stale, many, "l0", 34), orderTabs(many, []).slice(1).concat("l0"));
  });
});

describe("seen Tabs", () => {
  test("a missing key is a first visit; a malformed one is an empty list", () => {
    assert.equal(parseSeen(null), null);
    assert.deepEqual(parseSeen("not json"), []);
    assert.deepEqual(parseSeen('{"a":1}'), []);
    assert.deepEqual(parseSeen('["a",2,"b"]'), ["a", "b"]);
  });

  test("marking adds the slug last, once", () => {
    assert.deepEqual(markSeen([], ["a"], "a"), ["a"]);
    assert.deepEqual(markSeen(["a", "b"], ["a", "b"], "a"), ["b", "a"]);
    assert.deepEqual(markSeen(["x"], ["a"], "a"), ["x", "a"]);
  });

  test("the cap drops the earliest stale slugs, never a live one", () => {
    const stale = Array.from({ length: 30 }, (_, i) => `s${i}`);
    const out = markSeen(["a", ...stale], ["a", "b"], "b");
    assert.equal(out.length, 30);
    assert.deepEqual(out.slice(0, 2), ["a", "s2"]);
    assert.equal(out.at(-1), "b");
    const many = Array.from({ length: 35 }, (_, i) => `l${i}`);
    assert.deepEqual(markSeen(many.slice(0, 34), many, "l34"), many);
  });

  test("fresh is the live slugs not yet seen", () => {
    assert.deepEqual(fresh(["a", "b", "c"], ["b", "x"]), ["a", "c"]);
    assert.deepEqual(fresh([], ["a"]), []);
  });
});

test("Not found names what's missing and the nearest real page", () => {
  assert.deepEqual(missing("/s/nope"), { what: "No grill nope.", back: { href: "/", label: "Back home" } });
  assert.deepEqual(missing("/p/zzz"), { what: "No project ZZZ.", back: { href: "/p", label: "Back to Projects" } });
  assert.deepEqual(missing("/p/kiln/plans"), { what: "No page at /p/kiln/plans.", back: { href: "/", label: "Back home" } });
  assert.deepEqual(missing("/p/zzz/logs"), { what: "No project ZZZ.", back: { href: "/p", label: "Back to Projects" } });
  assert.deepEqual(missing("/i/kiln-99"), { what: "No issue KILN-99.", back: { href: "/p/KILN", label: "Back to KILN's issues" } });
  assert.deepEqual(missing("/i/nonsense"), { what: "No issue NONSENSE.", back: { href: "/p", label: "Back to Projects" } });
  assert.deepEqual(missing("/l/2026-10-25/9"), { what: "No log entry there.", back: { href: "/p", label: "Back to Projects" } });
});

test("Not found on a course page names the course, the note or the file", () => {
  const courses = { href: "/learn", label: "Back to Learn" };
  assert.deepEqual(missing("/learn/nope"), { what: "No course nope.", back: courses });
  assert.deepEqual(missing("/learn/nope/cards"), { what: "No course nope.", back: courses });
  assert.deepEqual(missing("/learn/llm/knowledge/x"), { what: "No note x.", back: { href: "/learn/llm/notes", label: "Back to Notes" } });
  assert.deepEqual(missing("/learn/llm/sources/y"), { what: "No source y.", back: { href: "/learn/llm/notes", label: "Back to Notes" } });
  assert.deepEqual(missing("/learn/llm/lessons/2026-10-24-x"), {
    what: "No lesson 2026-10-24-x.",
    back: { href: "/learn/llm/lessons", label: "Back to Lessons" },
  });
  assert.deepEqual(missing("/learn/llm/work/a/b.py"), { what: "No file work/a/b.py.", back: { href: "/learn/llm/work", label: "Back to Work" } });
  assert.deepEqual(missing("/learn/llm/nope"), { what: "No page at /learn/llm/nope.", back: { href: "/learn/llm", label: "Back to the course" } });
});

test("a course's Work tab is a workspace; its other tabs read", () => {
  for (const p of ["/learn/llm/work", "/learn/llm/work/", "/learn/llm/work/a.py"]) assert.equal(pageKind(p), "workspace");
  for (const p of ["/learn/llm", "/learn/llm/notes", "/learn/llm/workshop"]) assert.equal(pageKind(p), "reading");
});

test("drawer prefs default and clamp the width", () => {
  assert.deepEqual(parseDrawer(null), DRAWER_DEFAULTS);
  assert.deepEqual(parseDrawer('{"open":false,"width":9000}'), { open: false, width: 760 });
  assert.deepEqual(parseDrawer('{"width":10}'), { open: true, width: 320 });
});

test("terrain is the same for the same seed", () => {
  assert.deepEqual(terrain("belay", 900, 100), terrain("belay", 900, 100));
  assert.notDeepEqual(terrain("belay", 900, 100), terrain("kiln", 900, 100));
});
