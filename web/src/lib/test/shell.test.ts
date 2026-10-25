import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { terrain } from "../course-art.ts";
import { COLLAPSED_DEFAULTS, DRAWER_DEFAULTS, missing, pageKind, parseCollapsed, parseDrawer, selectTab, sessionSlug } from "../shell.ts";

describe("page kinds", () => {
  test("a grill page is a workspace; everything else reads", () => {
    assert.equal(pageKind("/s/merge-belay-sear-topo"), "workspace");
    assert.equal(pageKind("/s/x/"), "workspace");
    for (const p of ["/", "/p", "/p/SEAR", "/courses", "/nope"]) assert.equal(pageKind(p), "reading");
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
  assert.deepEqual(missing("/p/sear/plans"), { what: "No page at /p/sear/plans.", back: { href: "/", label: "Back home" } });
});

test("drawer prefs default and clamp the width", () => {
  assert.deepEqual(parseDrawer(null), DRAWER_DEFAULTS);
  assert.deepEqual(parseDrawer('{"open":false,"width":9000}'), { open: false, width: 760 });
  assert.deepEqual(parseDrawer('{"width":10}'), { open: true, width: 320 });
});

test("terrain is the same for the same seed", () => {
  assert.deepEqual(terrain("belay", 900, 100), terrain("belay", 900, 100));
  assert.notDeepEqual(terrain("belay", 900, 100), terrain("sear", 900, 100));
});
