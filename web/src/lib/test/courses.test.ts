import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { cardData } from "../course-home.ts";
import { sectionOf } from "../course-nav.ts";
import {
  citedBy,
  courseDir,
  inProgress,
  lessonStats,
  listKnowledge,
  listLessons,
  noteStats,
  parseMisconceptions,
  parseSourceIndex,
  readCourseFile,
  splitMisconception,
  splitTitle,
  visibleParts,
  type CourseSummary,
} from "../courses.ts";
import { relativeDue } from "../format.ts";
import { routineCommand } from "../routines.ts";
import { SessionParser } from "../session-log.ts";
import { courseIgnored, courseLocate } from "../watch-paths.ts";
import { resolveWikiTarget } from "../wiki-target.ts";
import { listWork, workPath, writeWork } from "../work.ts";

const tmp = mkdtempSync(path.join(os.tmpdir(), "belay-courses-"));
process.env.HANDHOLD_ROOT = tmp;
after(() => rmSync(tmp, { recursive: true, force: true }));

const put = (rel: string, text: string) => {
  const abs = path.join(tmp, rel);
  mkdirSync(path.dirname(abs), { recursive: true });
  writeFileSync(abs, text);
};

put("llm/course.md", "---\ngoal: x\n---\n");
put("llm/knowledge/matmul-flops.md", [
  "# Matrix multiplication and FLOP counting",
  "",
  'A FLOP is one arithmetic step. [[sources/cs336]] "a basic operation" ^c1',
  'FLOPs counts work; FLOP/s is a rate. [[sources/cs336]] "terribly confusing" [[sources/epoch]] "MACs" ^c2',
  "A line with no claim id. [[sources/epoch]]",
].join("\n"));
put("llm/knowledge/softmax.md", '# Softmax\n\nSoftmax squashes. [[sources/cs336]] "soft" ^c1\n');
put("llm/lessons/2026-10-23-matmul-flops.md", "# Shapes and FLOPs\n");
put("llm/lessons/2026-10-24-matmul-flops.md", "# Why a matmul costs 2mkn\n");
put("llm/exercises/e1.md", "worked solution");
put("not-a-course/notes.md", "");

describe("course folders", () => {
  test("only folders with a course.md are courses, and slugs can't escape the root", () => {
    assert.equal(courseDir("llm"), path.join(tmp, "llm"));
    assert.equal(courseDir("not-a-course"), null);
    assert.equal(courseDir("../llm"), null);
  });

  test("hidden files never reach the site", () => {
    assert.deepEqual(visibleParts("knowledge/a.md"), ["knowledge", "a.md"]);
    assert.deepEqual(visibleParts("work/project/model.py"), ["work", "project", "model.py"]);
    for (const rel of ["exercises/e1.md", "rubrics/r.md", "verification.md", ".build/x", "../llm/course.md", "/etc/passwd", "knowledge/.x"]) {
      assert.equal(visibleParts(rel), null, rel);
    }
    assert.equal(readCourseFile("llm", "exercises/e1.md"), null);
    assert.equal(readCourseFile("llm", "course.md"), "---\ngoal: x\n---\n");
  });

  test("lessons list newest first, titled by their heading", () => {
    assert.deepEqual(
      listLessons("llm").map((l) => [l.date, l.topic, l.title]),
      [
        ["2026-10-24", "matmul-flops", "Why a matmul costs 2mkn"],
        ["2026-10-23", "matmul-flops", "Shapes and FLOPs"],
      ],
    );
    assert.deepEqual(listKnowledge("llm")[0], { slug: "matmul-flops", title: "Matrix multiplication and FLOP counting" });
  });

  test("a source is cited by the claim lines that link it", () => {
    assert.deepEqual(citedBy("llm", "cs336"), { claims: 3, topics: ["matmul-flops", "softmax"] });
    // The epoch link on a line with no ^cN isn't a claim.
    assert.deepEqual(citedBy("llm", "epoch"), { claims: 1, topics: ["matmul-flops"] });
    assert.deepEqual(citedBy("llm", "nobody"), { claims: 0, topics: [] });
  });
});

describe("course text", () => {
  test("a note's claims and the distinct sources it cites", () => {
    const { body } = splitTitle(readCourseFile("llm", "knowledge/matmul-flops.md")!);
    assert.deepEqual(noteStats(body), { claims: 2, sources: 2 });
  });

  test("splitTitle drops frontmatter and takes the first heading", () => {
    assert.deepEqual(splitTitle("---\na: 1\n---\n# Title\nbody"), { title: "Title", body: "body" });
    assert.deepEqual(splitTitle("no heading"), { title: null, body: "no heading" });
  });

  test("the source register skips its header rows", () => {
    const text = [
      "| id | title | url or path | accessed | licence | role |",
      "|----|-------|-------------|----------|---------|------|",
      "| raschka | Raschka, appendix A | (own copy) | 2026-10-21 | personal copy | backbone |",
      "| cs336 | CS336 lecture 2 | https://x | 2026-10-21 | MIT | supporting |",
    ].join("\n");
    assert.deepEqual(parseSourceIndex(text), [
      { id: "raschka", title: "Raschka, appendix A", role: "backbone" },
      { id: "cs336", title: "CS336 lecture 2", role: "supporting" },
    ]);
  });

  test("misconceptions: topic, date, continuation lines, and the claim split from its correction", () => {
    const { field, mine } = parseMisconceptions(
      [
        "# Misconceptions",
        "## Known in the field",
        "- **matmul-flops** · A matmul costs $mnp$ FLOPs — each multiply pairs with an add,",
        "  so it is $2mnp$. [[sources/epoch]]",
        "",
        "## Mine",
        "- 2026-10-24 · **softmax** · Softmax is a smooth max — it's a soft arg max",
      ].join("\n"),
    );
    assert.deepEqual(field, [{ date: null, topic: "matmul-flops", text: "A matmul costs $mnp$ FLOPs — each multiply pairs with an add, so it is $2mnp$. [[sources/epoch]]" }]);
    assert.deepEqual(mine, [{ date: "2026-10-24", topic: "softmax", text: "Softmax is a smooth max — it's a soft arg max" }]);
    assert.deepEqual(splitMisconception(field[0].text), {
      claim: "A matmul costs $mnp$ FLOPs",
      correction: "each multiply pairs with an add, so it is $2mnp$. [[sources/epoch]]",
    });
    assert.deepEqual(splitMisconception("no dash here"), { claim: "no dash here", correction: null });
  });

  test("a lesson note's counts: exercises (and alone), claims, open questions", () => {
    const body = [
      "## Covered",
      "Why a matmul costs 2mkn [[matmul-flops#^c12]] [[matmul-flops#^c14]] and [k:matmul-flops^c12].",
      "## Exercises",
      "- e1 · alone: FLOPs for a projection",
      "- e2 · with hints: the backward pass",
      "- a note that isn't an exercise",
      "## Open questions",
      "- Does an FMA count as one FLOP or two?",
    ].join("\n");
    assert.deepEqual(lessonStats(body), { exercises: 2, alone: 1, claims: 2, questions: 1 });
  });

  test("due dates read relative to today", () => {
    assert.equal(relativeDue("2026-10-23", "2026-10-25"), "overdue 2 days");
    assert.equal(relativeDue("2026-10-24", "2026-10-25"), "overdue 1 day");
    assert.equal(relativeDue("2026-10-25", "2026-10-25"), "today");
    assert.equal(relativeDue("2026-10-26", "2026-10-25"), "tomorrow");
    assert.equal(relativeDue("2026-10-31", "2026-10-25"), "in 6 days");
  });
});

describe("course links", () => {
  test("wiki links resolve to course pages, block refs to anchors", () => {
    assert.equal(resolveWikiTarget("llm", "matmul-flops"), "/courses/llm/knowledge/matmul-flops");
    assert.equal(resolveWikiTarget("llm", "matmul-flops#^c3"), "/courses/llm/knowledge/matmul-flops#c3");
    assert.equal(resolveWikiTarget("llm", "sources/cs336"), "/courses/llm/sources/cs336");
    assert.equal(resolveWikiTarget("llm", "lessons/2026-10-24-x"), "/courses/llm/lessons/2026-10-24-x");
    assert.equal(resolveWikiTarget("llm", "syllabus"), "/courses/llm");
    assert.equal(resolveWikiTarget("llm", "map.md"), "/courses/llm/map");
  });

  test("sectionOf lights the tab a page belongs to", () => {
    assert.deepEqual(sectionOf("/courses/llm"), { course: "llm", section: "Syllabus", detail: false });
    assert.deepEqual(sectionOf("/courses/llm/cards"), { course: "llm", section: "Cards", detail: false });
    assert.deepEqual(sectionOf("/courses/llm/knowledge/x"), { course: "llm", section: "Notes", detail: true });
    assert.deepEqual(sectionOf("/courses/llm/sources/x"), { course: "llm", section: "Notes", detail: true });
    assert.deepEqual(sectionOf("/courses/llm/lessons/x"), { course: "llm", section: "Lessons", detail: true });
    assert.deepEqual(sectionOf("/courses/llm/work/a/b.py"), { course: "llm", section: "Work", detail: false });
    assert.equal(sectionOf("/p/SEAR"), null);
  });

  test("the course watcher reports visible paths only", () => {
    assert.deepEqual(courseLocate(tmp, path.join(tmp, "llm", "knowledge", "a.md")), ["llm", "knowledge/a.md"]);
    assert.deepEqual(courseLocate(tmp, path.join(tmp, "llm", "work", "x", "y.py").replaceAll("\\", "/")), ["llm", "work/x/y.py"]);
    assert.equal(courseLocate(tmp, path.join(tmp, "llm", "exercises", "e1.md")), null);
    const ignored = courseIgnored(tmp);
    assert.equal(ignored(tmp), false);
    assert.equal(ignored(path.join(tmp, "llm")), false);
    assert.equal(ignored(path.join(tmp, "llm", "knowledge")), false);
    assert.equal(ignored(path.join(tmp, "llm", "rubrics")), true);
    assert.equal(ignored(path.join(tmp, ".obsidian")), true);
  });
});

describe("work/", () => {
  test("only paths under work/ can be written", () => {
    assert.equal(workPath("llm", "work/a.py"), path.join(tmp, "llm", "work", "a.py"));
    for (const rel of ["work", "knowledge/x.md", "work/../course.md", "work/.venv/x", "../llm/work/a.py"]) assert.equal(workPath("llm", rel), null, rel);
  });

  test("a save from a stale base conflicts and hands back the disk text; force overwrites", () => {
    const made = writeWork("llm", "work/a.py", "one", { base: null });
    assert.ok(made.ok);
    assert.deepEqual(writeWork("llm", "work/a.py", "x", { base: null }), { ok: false, status: 409, error: "A file with that name exists." });
    const abs = path.join(tmp, "llm", "work", "a.py");
    writeFileSync(abs, "changed elsewhere");
    const stale = writeWork("llm", "work/a.py", "two", { base: made.ok ? made.mtime - 1000 : 0 });
    assert.equal(stale.ok, false);
    assert.equal(!stale.ok && stale.text, "changed elsewhere");
    assert.ok(writeWork("llm", "work/a.py", "two", { base: 0, force: true }).ok);
    assert.equal(readFileSync(abs, "utf8"), "two");
    assert.ok(statSync(abs).isFile());
    assert.deepEqual(listWork("llm"), [{ path: "work/a.py", name: "a.py", depth: 0, dir: false }]);
  });
});

describe("course cards", () => {
  const summary = (o: Partial<CourseSummary>): CourseSummary => ({
    course: "llm",
    title: "LLM Architecture",
    goal: null,
    build: "accepted",
    ready: [1, 2],
    unbuilt: [3],
    traits: [],
    cards: { total: 0, due: 0, overdue: 0, new: 0, nextDue: null },
    topics: { done: 0, total: 10 },
    next: { topic: "matmul-flops", status: "in-progress", unit: 1 },
    last: null,
    checkpoint: { unit: 1, title: "Maths", result: "pending", left: ["matmul-flops"], due: false },
    units: 3,
    created: null,
    hue: 0,
    ...o,
  });

  test("a course is in progress while it has a topic, a checkpoint or a unit left", () => {
    assert.equal(inProgress(summary({})), true);
    assert.equal(inProgress(summary({ next: null, checkpoint: null, unbuilt: [] })), false);
  });

  test("the band leads with the lesson, unless many cards or a checkpoint are due", () => {
    const lesson = cardData(summary({}), [0, 0, null]);
    assert.equal(lesson.lead?.kind, "Lesson");
    assert.equal(lesson.lead?.meta, "In progress · Unit 1 · no cards due");
    const review = cardData(summary({ cards: { total: 30, due: 25, overdue: 0, new: 0, nextDue: null } }), []);
    assert.deepEqual([review.lead?.kind, ...review.rest.map((r) => r.kind)], ["Review", "Lesson"]);
    const cp = cardData(summary({ checkpoint: { unit: 1, title: "Maths", result: "pending", left: [], due: true } }), []);
    assert.equal(cp.lead?.kind, "Checkpoint");
  });

  test("routines run their /learn command", () => {
    assert.equal(routineCommand("lesson", "llm").command, "/learn llm");
    assert.equal(routineCommand("quick", "llm").command, "/learn llm --quick");
    assert.equal(routineCommand("review", "llm").command, "/learn:review llm");
    assert.equal(routineCommand("checkpoint", "llm").command, "/learn:checkpoint llm");
  });
});

test("the session log records the course files a session wrote", () => {
  const p = new SessionParser("s1", tmp);
  const abs = path.join(tmp, "llm", "lessons", "2026-10-24-matmul-flops.md");
  p.push(JSON.stringify({ type: "user", timestamp: "2026-10-24T10:00:00Z", message: { content: "/learn llm" } }));
  p.push(JSON.stringify({ type: "assistant", timestamp: "2026-10-24T10:05:00Z", message: { content: [{ type: "tool_use", id: "t1", name: "Write", input: { file_path: abs } }] } }));
  assert.deepEqual(p.state.wrote, ["llm/lessons/2026-10-24-matmul-flops.md"]);
  assert.equal(p.state.startedAt, "2026-10-24T10:00:00Z");
  assert.equal(p.state.endedAt, "2026-10-24T10:05:00Z");
});
