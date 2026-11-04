import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { installedIds } from "../../../../src/extension-ids.ts";
import { mergeEntries, sidebarSections } from "../sidebar.ts";

// Each extension's own cases are in its `_lib/test/shell.test.ts`.
const ALL = installedIds();
const bel = { key: "BEL", name: "Belay" };
const lit = (s: ReturnType<typeof sidebarSections>) => s?.rows.filter((r) => r.on).map((r) => r.label);

describe("sidebar sections", () => {
  test("a Workspace and a page outside a project or owned place have none", () => {
    assert.equal(sidebarSections({ kind: "workspace", project: bel, section: "Grills" }, "/s/x", ALL), null);
    assert.equal(sidebarSections({ kind: "reading" }, "/p", ALL), null);
  });

  test("a project lights its section by the page's section, else by address", () => {
    const issue = sidebarSections({ kind: "reading", project: bel, section: "Issues" }, "/i/BEL-1", []);
    assert.equal(issue?.head, "Belay");
    assert.deepEqual(issue?.rows.map((r) => r.href), ["/p/BEL", "/p/BEL/activity", "/p/BEL/logs"]);
    assert.deepEqual(lit(issue), ["Issues"]);
    assert.deepEqual(lit(sidebarSections({ kind: "reading", project: bel }, "/p/BEL/activity", ALL)), ["Activity"]);
  });

  test("the active extensions' sections sit between Issues and Activity", () => {
    const rows = sidebarSections({ kind: "reading", project: bel }, "/p/BEL", ALL)?.rows.map((r) => r.label);
    assert.equal(rows?.[0], "Issues");
    assert.deepEqual(rows?.slice(-2), ["Activity", "Logs"]);
  });
});

test("cards for one key merge into one, their facts joined", () => {
  const merged = mergeEntries([
    { key: "unfiled", name: "Unfiled", facts: "2 grills" },
    { key: "X", name: "X", facts: "1" },
    { key: "unfiled", name: "Unfiled", facts: "1 review" },
  ]);
  assert.deepEqual(merged, [
    { key: "unfiled", name: "Unfiled", facts: "2 grills · 1 review" },
    { key: "X", name: "X", facts: "1" },
  ]);
});
