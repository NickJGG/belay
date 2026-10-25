import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { terrain } from "../course-art.ts";
import { COLLAPSED_DEFAULTS, DRAWER_DEFAULTS, missing, pageKind, parseCollapsed, parseDrawer, selectTab, sessionSlug } from "../shell.ts";

describe("page kinds", () => {
  test("a grill page is a workspace; everything else reads", () => {
    assert.equal(pageKind("/s/one-grills-root"), "workspace");
    assert.equal(pageKind("/s/x/"), "workspace");
    for (const p of ["/", "/p", "/p/KILN", "/courses", "/nope"]) assert.equal(pageKind(p), "reading");
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
  const courses = { href: "/courses", label: "Back to Courses" };
  assert.deepEqual(missing("/courses/nope"), { what: "No course nope.", back: courses });
  assert.deepEqual(missing("/courses/nope/cards"), { what: "No course nope.", back: courses });
  assert.deepEqual(missing("/courses/llm/knowledge/x"), { what: "No note x.", back: { href: "/courses/llm/notes", label: "Back to Notes" } });
  assert.deepEqual(missing("/courses/llm/sources/y"), { what: "No source y.", back: { href: "/courses/llm/notes", label: "Back to Notes" } });
  assert.deepEqual(missing("/courses/llm/lessons/2026-10-24-x"), {
    what: "No lesson 2026-10-24-x.",
    back: { href: "/courses/llm/lessons", label: "Back to Lessons" },
  });
  assert.deepEqual(missing("/courses/llm/work/a/b.py"), { what: "No file work/a/b.py.", back: { href: "/courses/llm/work", label: "Back to Work" } });
  assert.deepEqual(missing("/courses/llm/nope"), { what: "No page at /courses/llm/nope.", back: { href: "/courses/llm", label: "Back to the course" } });
});

test("a course's Work tab is a workspace; its other tabs read", () => {
  for (const p of ["/courses/llm/work", "/courses/llm/work/", "/courses/llm/work/a.py"]) assert.equal(pageKind(p), "workspace");
  for (const p of ["/courses/llm", "/courses/llm/notes", "/courses/llm/workshop"]) assert.equal(pageKind(p), "reading");
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
