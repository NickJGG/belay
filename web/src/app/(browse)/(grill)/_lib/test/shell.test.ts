import assert from "node:assert/strict";
import { test } from "node:test";
import { missing, pageKind, pageTab } from "../../../../../lib/shell.ts";
import { pseudoProject, sectionsOf, sidebarSections } from "../../../../../lib/sidebar.ts";
import { sessionSlug, UNFILED } from "../manifest.ts";

const on = ["grill"] as const;

test("sessionSlug reads /s/<slug> only", () => {
  assert.equal(sessionSlug("/s/a-b"), "a-b");
  assert.equal(sessionSlug("/p/a-b"), null);
  assert.equal(sessionSlug("/s/"), null);
});

test("a grill page is a workspace and its own Tab, while grill is active", () => {
  assert.equal(pageKind("/s/one-grills-root", on), "workspace");
  assert.equal(pageKind("/s/x/", on), "workspace");
  assert.equal(pageTab("/s/x", [], on), "x");
  assert.equal(pageKind("/s/x", []), "reading");
});

test("Not found names a missing grill, or nothing while grill is off", () => {
  assert.deepEqual(missing("/s/nope", on), { what: "No grill nope.", back: { href: "/", label: "Back home" } });
  assert.deepEqual(missing("/s/nope", []), { what: "No page at /s/nope.", back: { href: "/", label: "Back home" } });
  assert.equal(missing("/p/zzz/grills", on).what, "No project ZZZ.");
  assert.equal(missing("/p/zzz/grills", []).what, "No page at /p/zzz/grills.");
  assert.equal(missing("/p/unfiled", []).what, "No page at /p/unfiled.");
});

test("projects get Grills after Issues; Unfiled has only Grills", () => {
  assert.deepEqual(sectionsOf("BEL", on).map((s) => s.label), ["Issues", "Grills", "Activity", "Logs"]);
  assert.deepEqual(sectionsOf("BEL", []).map((s) => s.label), ["Issues", "Activity", "Logs"]);
  const s = sidebarSections({ kind: "reading", project: { key: UNFILED, name: "Unfiled" } }, "/p/unfiled/grills", on);
  assert.deepEqual(s?.rows, [{ label: "Grills", href: "/p/unfiled/grills", on: true }]);
  assert.equal(pseudoProject(UNFILED, on), "grill");
  assert.equal(pseudoProject(UNFILED, []), undefined);
});
