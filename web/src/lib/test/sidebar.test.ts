import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { sidebarSections } from "../sidebar.ts";

const bel = { key: "BEL", name: "Belay" };
const course = { slug: "llm", title: "LLM architecture" };
const lit = (s: ReturnType<typeof sidebarSections>) => s?.rows.filter((r) => r.on).map((r) => r.label);

describe("sidebar sections", () => {
  test("a Workspace and a page outside a project or course have none", () => {
    assert.equal(sidebarSections({ kind: "workspace", project: bel, section: "Grills" }, "/s/x"), null);
    assert.equal(sidebarSections({ kind: "workspace", course }, "/courses/llm/work"), null);
    assert.equal(sidebarSections({ kind: "reading" }, "/p"), null);
  });

  test("a project lights its section by the page's section, else by address", () => {
    const issue = sidebarSections({ kind: "reading", project: bel, section: "Issues" }, "/i/BEL-1");
    assert.equal(issue?.head, "Belay");
    assert.deepEqual(issue?.rows.map((r) => r.href), ["/p/BEL", "/p/BEL/grills", "/p/BEL/activity", "/p/BEL/logs"]);
    assert.deepEqual(lit(issue), ["Issues"]);
    assert.deepEqual(lit(sidebarSections({ kind: "reading", project: bel }, "/p/BEL/activity")), ["Activity"]);
  });

  test("Unfiled has only Grills", () => {
    const s = sidebarSections({ kind: "reading", project: { key: "unfiled", name: "Unfiled" } }, "/p/unfiled/grills");
    assert.deepEqual(s?.rows, [{ label: "Grills", href: "/p/unfiled/grills", on: true }]);
  });

  test("a course detail page lights its section", () => {
    assert.deepEqual(lit(sidebarSections({ kind: "reading", course }, "/courses/llm/knowledge/attention")), ["Notes"]);
    assert.deepEqual(lit(sidebarSections({ kind: "reading", course }, "/courses/llm/lessons/one")), ["Lessons"]);
    assert.deepEqual(lit(sidebarSections({ kind: "reading", course }, "/courses/llm")), ["Overview"]);
    assert.deepEqual(lit(sidebarSections({ kind: "reading", course }, "/courses/llm/syllabus")), ["Syllabus"]);
    assert.deepEqual(lit(sidebarSections({ kind: "reading", course, section: "Cards" }, "/courses/llm/x")), ["Cards"]);
  });
});
