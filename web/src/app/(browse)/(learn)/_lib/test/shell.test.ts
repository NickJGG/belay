import assert from "node:assert/strict";
import { test } from "node:test";
import { missing, pageKind, pageTab } from "../../../../../lib/shell.ts";
import { sidebarSections } from "../../../../../lib/sidebar.ts";

const on = ["learn"] as const;
const course = { id: "learn", key: "llm", title: "LLM architecture" } as const;
const lit = (s: ReturnType<typeof sidebarSections>) => s?.rows.filter((r) => r.on).map((r) => r.label);

test("a course's Work tab and Now are workspaces; its other tabs read", () => {
  for (const p of ["/learn/llm/work", "/learn/llm/work/", "/learn/llm/work/a.py", "/learn/llm/now"]) assert.equal(pageKind(p, on), "workspace");
  for (const p of ["/learn/llm", "/learn/llm/notes", "/learn/llm/workshop"]) assert.equal(pageKind(p, on), "reading");
  assert.equal(pageKind("/learn/llm/work", []), "reading");
});

test("a course's pages belong to its live lesson's Tab", () => {
  const live = [{ slug: "lesson-1", course: "llm" }];
  assert.equal(pageTab("/learn/llm/notes", live, on), "lesson-1");
  assert.equal(pageTab("/learn/other", live, on), null);
  assert.equal(pageTab("/learn/llm/notes", live, []), null);
});

test("Not found on a course page names the course, the note or the file", () => {
  const courses = { href: "/learn", label: "Back to Learn" };
  assert.deepEqual(missing("/learn/nope", on), { what: "No course nope.", back: courses });
  assert.deepEqual(missing("/learn/nope/cards", on), { what: "No course nope.", back: courses });
  assert.deepEqual(missing("/learn/llm/knowledge/x", on), { what: "No note x.", back: { href: "/learn/llm/notes", label: "Back to Notes" } });
  assert.deepEqual(missing("/learn/llm/sources/y", on), { what: "No source y.", back: { href: "/learn/llm/notes", label: "Back to Notes" } });
  assert.deepEqual(missing("/learn/llm/lessons/2026-10-24-x", on), {
    what: "No lesson 2026-10-24-x.",
    back: { href: "/learn/llm/lessons", label: "Back to Lessons" },
  });
  assert.deepEqual(missing("/learn/llm/work/a/b.py", on), { what: "No file work/a/b.py.", back: { href: "/learn/llm/work", label: "Back to Work" } });
  assert.deepEqual(missing("/learn/llm/nope", on), { what: "No page at /learn/llm/nope.", back: { href: "/learn/llm", label: "Back to the course" } });
});

test("with learn off, a course page gets the generic line and no Back to Learn", () => {
  for (const p of ["/learn", "/learn/nope", "/learn/llm/knowledge/x"]) {
    assert.deepEqual(missing(p, []), { what: `No page at ${p}.`, back: { href: "/", label: "Back home" } });
  }
});

test("a course detail page lights its section", () => {
  assert.deepEqual(lit(sidebarSections({ kind: "reading", owner: course }, "/learn/llm/knowledge/attention", on)), ["Notes"]);
  assert.deepEqual(lit(sidebarSections({ kind: "reading", owner: course }, "/learn/llm/lessons/one", on)), ["Lessons"]);
  assert.deepEqual(lit(sidebarSections({ kind: "reading", owner: course }, "/learn/llm", on)), ["Overview"]);
  assert.deepEqual(lit(sidebarSections({ kind: "reading", owner: course }, "/learn/llm/syllabus", on)), ["Syllabus"]);
  assert.deepEqual(lit(sidebarSections({ kind: "reading", owner: course, section: "Cards" }, "/learn/llm/x", on)), ["Cards"]);
  assert.equal(sidebarSections({ kind: "workspace", owner: course }, "/learn/llm/work", on), null);
  assert.equal(sidebarSections({ kind: "reading", owner: course }, "/learn/llm", []), null);
});
