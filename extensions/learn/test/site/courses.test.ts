import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { cardData, currentUnit, exerciseRows, heroStep, homeSlice, journeySteps, readingBooks } from "../../web/_lib/course-home.ts";
import { sectionOf } from "../../web/_lib/course-nav.ts";
import {
  citedBy,
  courseDir,
  getCourse,
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
  type Unit,
} from "../../web/_lib/courses.ts";
import { routineCommand } from "../../web/_lib/routines.ts";
import { LEGACY_TOOLS, SessionParser } from "../../web/_lib/session-log.ts";
import { resolveWikiTarget } from "../../web/_lib/wiki-target.ts";
import { listWork, workPath, writeWork } from "../../web/_lib/work.ts";

const tmp = mkdtempSync(path.join(os.tmpdir(), "belay-courses-"));
process.env.LEARNING_ROOT = tmp;
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
});

describe("course links", () => {
  test("wiki links resolve to course pages, block refs to anchors", () => {
    assert.equal(resolveWikiTarget("llm", "matmul-flops"), "/learn/llm/knowledge/matmul-flops");
    assert.equal(resolveWikiTarget("llm", "matmul-flops#^c3"), "/learn/llm/knowledge/matmul-flops#c3");
    assert.equal(resolveWikiTarget("llm", "sources/cs336"), "/learn/llm/sources/cs336");
    assert.equal(resolveWikiTarget("llm", "lessons/2026-10-24-x"), "/learn/llm/lessons/2026-10-24-x");
    assert.equal(resolveWikiTarget("llm", "syllabus"), "/learn/llm");
    assert.equal(resolveWikiTarget("llm", "map.md"), "/learn/llm/map");
  });

  test("sectionOf lights the tab a page belongs to", () => {
    assert.deepEqual(sectionOf("/learn/llm"), { course: "llm", section: "Overview", detail: false });
    assert.deepEqual(sectionOf("/learn/llm/syllabus"), { course: "llm", section: "Syllabus", detail: false });
    assert.deepEqual(sectionOf("/learn/llm/cards"), { course: "llm", section: "Cards", detail: false });
    assert.deepEqual(sectionOf("/learn/llm/knowledge/x"), { course: "llm", section: "Notes", detail: true });
    assert.deepEqual(sectionOf("/learn/llm/sources/x"), { course: "llm", section: "Notes", detail: true });
    assert.deepEqual(sectionOf("/learn/llm/lessons/x"), { course: "llm", section: "Lessons", detail: true });
    assert.deepEqual(sectionOf("/learn/llm/work/a/b.py"), { course: "llm", section: "Work", detail: false });
    assert.equal(sectionOf("/p/KILN"), null);
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
  const kinds = (card: ReturnType<typeof cardData>) => [card.lead?.kind, ...card.rest.map((r) => r.kind)];
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
    titles: {},
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
    assert.equal(lesson.lead?.title, "matmul-flops");
    assert.equal(cardData(summary({ titles: { "matmul-flops": "Matmul FLOPs" } }), []).lead?.title, "Matmul FLOPs");
    assert.equal(lesson.lead?.meta, "In progress · Unit 1 · no cards due");
    const review = cardData(summary({ cards: { total: 30, due: 25, overdue: 0, new: 0, nextDue: null } }), []);
    assert.deepEqual([review.lead?.kind, ...review.rest.map((r) => r.kind)], ["Review", "Lesson"]);
    const cp = cardData(summary({ checkpoint: { unit: 1, title: "Maths", result: "pending", left: [], due: true } }), []);
    assert.equal(cp.lead?.kind, "Checkpoint");
  });

  test("unread reading leads the lesson, after a checkpoint or a big review", () => {
    const reading = { source: "ddia-ch2", status: "todo" as const, label: "DDIA ch. 2", sections: ["Replication", "Partitioning"] };
    const next = { topic: "matmul-flops", status: "todo" as const, unit: 1, reading };
    const card = cardData(summary({ next, cards: { total: 5, due: 5, overdue: 0, new: 5, nextDue: null } }), []);
    assert.deepEqual([card.lead?.kind, ...card.rest.map((r) => r.kind)], ["Reading", "Lesson"]);
    assert.equal(card.lead?.title, "Read DDIA ch. 2");
    assert.equal(card.lead?.meta, "Replication, Partitioning");
    assert.equal(card.lead?.source, "ddia-ch2");
    assert.equal(card.rest[0].meta, "Unit 1 · starts with your 5 due cards");
    const review = cardData(summary({ next, cards: { total: 30, due: 25, overdue: 0, new: 0, nextDue: null } }), []);
    assert.deepEqual([review.lead?.kind, ...review.rest.map((r) => r.kind)], ["Review", "Reading", "Lesson"]);
    const cp = cardData(summary({ next, checkpoint: { unit: 1, title: "Maths", result: "fail", left: [], due: false } }), []);
    assert.deepEqual([cp.lead?.kind, ...cp.rest.map((r) => r.kind)], ["Checkpoint", "Reading", "Lesson"]);
  });

  test("Home keeps the first 3 cards in order, with more only when some are cut", () => {
    const cards = ["a", "b", "c", "d"].map((course) => cardData(summary({ course }), []));
    const courses = (n: number) => {
      const s = homeSlice(cards.slice(0, n));
      return { courses: s.cards.map((c) => c.course.course), more: s.more };
    };
    assert.deepEqual(courses(2), { courses: ["a", "b"], more: false });
    assert.deepEqual(courses(3), { courses: ["a", "b", "c"], more: false });
    assert.deepEqual(courses(4), { courses: ["a", "b", "c"], more: true });
  });

  test("a read-after unit's reading comes after its topics, beside the checkpoint", () => {
    put("ra/course.md", "---\nbuild: accepted\nreading: start\nread-after: [1]\n---\n");
    const syllabus = (status: string) =>
      `## Unit 1 · Designs\n- [ ] chat · ${status}\n- [ ] read · ddia-ch5 · todo · DDIA ch. 5 · Leaders and Followers\n- checkpoint 1 · pending\n`;
    put("ra/syllabus.md", syllabus("todo"));
    assert.deepEqual(kinds(cardData(getCourse("ra")!, [])), ["Lesson"]);
    put("ra/syllabus.md", syllabus("done"));
    const done = cardData(getCourse("ra")!, []);
    assert.deepEqual(kinds(done), ["Checkpoint", "Reading"]);
    assert.equal(done.rest[0].title, "Read DDIA ch. 5");
  });

  test("the journey strip folds a run of reading into one step and lights the next topic", () => {
    const read = (source: string, status: "todo" | "done") => ({ kind: "read" as const, source, status, label: source, sections: [] });
    const items: Unit["items"] = [
      read("a", "done"),
      read("b", "todo"),
      { kind: "topic", topic: "chat", status: "in-progress" },
      { kind: "topic", topic: "feed", status: "todo" },
      { kind: "checkpoint", result: "pending", date: null, score: null },
    ];
    const unit: Unit = { n: 1, title: "Designs", topics: [], checkpoint: null, reading: [], items };
    const steps = journeySteps({ next: { topic: "chat", status: "in-progress", unit: 1 }, checkpoint: null, titles: { chat: "Designing a chat service" } }, unit);
    assert.deepEqual(steps, [
      { kind: "reading", label: "Reading", sub: "1 of 2 read", state: "part" },
      { kind: "topic", label: "Designing a chat service", sub: "In progress", state: "now" },
      { kind: "topic", label: "feed", sub: "", state: "todo" },
      { kind: "checkpoint", label: "Checkpoint 1", sub: "", state: "todo" },
    ]);
    const due = { unit: 1, title: "Designs", result: "pending" as const, left: [], due: true };
    assert.deepEqual(journeySteps({ next: null, checkpoint: due, titles: {} }, unit).map((s) => s.state), ["part", "todo", "todo", "now"]);
    const next = { topic: "chat", status: "todo" as const, unit: 1, reading: { source: "b", status: "todo" as const, label: "b", sections: [] } };
    assert.deepEqual(journeySteps({ next, checkpoint: null, titles: {} }, unit).map((s) => s.state), ["now", "todo", "todo", "todo"]);
  });

  const unit: Unit = {
    n: 2,
    title: "Data models",
    topics: [
      { topic: "relational", status: "done" },
      { topic: "documents", status: "in-progress" },
    ],
    checkpoint: { result: "pending", date: null, score: null },
    reading: [],
    items: [
      { kind: "read", source: "ddia-ch2", status: "done", label: "Designing Data-Intensive Applications ch. 2", sections: ["Relational"] },
      { kind: "read", source: "ddia-ch3", status: "todo", label: "Designing Data-Intensive Applications ch. 3", sections: ["Indexes", "OLAP"] },
      { kind: "read", source: "paper", status: "todo", label: "The Dynamo paper", sections: [] },
      { kind: "topic", topic: "relational", status: "done" },
      { kind: "topic", topic: "documents", status: "in-progress" },
      { kind: "checkpoint", result: "pending", date: null, score: null },
    ],
  };
  const progress = (outcomes: (string | null)[]) => ({
    applyAlone: outcomes.includes("alone"),
    lastQuiz: "4/5",
    quizOk: true,
    exercises: outcomes.map((outcome, i) => ({ n: i + 3, kind: "apply" as const, outcome: outcome as "alone" | null })),
  });

  test("reading lines group by book, chapters split at the last ' ch. '", () => {
    const reads = unit.items.flatMap((i) => (i.kind === "read" ? [i] : []));
    assert.deepEqual(readingBooks(reads), [
      {
        book: "Designing Data-Intensive Applications",
        chapters: [
          { label: "Ch. 2", source: "ddia-ch2", status: "done", sections: ["Relational"] },
          { label: "Ch. 3", source: "ddia-ch3", status: "todo", sections: ["Indexes", "OLAP"] },
        ],
      },
      { book: null, chapters: [{ label: "The Dynamo paper", source: "paper", status: "todo", sections: [] }] },
    ]);
  });

  test("exercise rows run apply, analyse, transfer, dropping empty kinds", () => {
    const rows = exerciseRows([
      { n: 7, kind: "transfer", outcome: null },
      { n: 3, kind: "apply", outcome: "with hints" },
      { n: 6, kind: "apply", outcome: "not solved" },
    ]);
    assert.deepEqual(rows, [
      { kind: "apply", items: [{ n: 3, outcome: "with hints" }, { n: 6, outcome: "not solved" }] },
      { kind: "transfer", items: [{ n: 7, outcome: null }] },
    ]);
  });

  test("the hero shows the topic with its finish chips, past a review", () => {
    const c = summary({
      next: { topic: "documents", status: "in-progress", unit: 2 },
      titles: { documents: "Document models" },
      cards: { total: 30, due: 25, overdue: 0, new: 0, nextDue: null },
    });
    const card = cardData(c, []);
    const items = [card.lead!, ...card.rest];
    assert.equal(card.lead?.kind, "Review");
    assert.equal(currentUnit(c, items), 2);
    const hero = heroStep(c, unit, items, progress(["with hints", null, "with hints"]));
    assert.deepEqual(hero, {
      kind: "topic",
      title: "Document models",
      line: "Starts with your 25 due cards",
      chips: [
        { label: "Quiz 4/5 or better", detail: "4/5", met: true },
        { label: "Solve an exercise alone", detail: "2 tried with hints", met: false, tip: "exercises" },
      ],
    });
    assert.equal(heroStep(c, unit, items, progress([null]))?.chips[1].detail, "None tried yet");
    const met = heroStep(c, unit, items, progress(["alone", "with hints"]))!.chips[1];
    assert.deepEqual([met.met, met.detail], [true, "1 solved alone"]);
    const quiet = summary({ next: { topic: "documents", status: "todo", unit: 2 } });
    assert.equal(heroStep(quiet, unit, cardData(quiet, []).rest, null)?.line, null);
  });

  test("the hero shows the unit's reading run when reading leads", () => {
    const reading = { source: "ddia-ch3", status: "todo" as const, label: "Designing Data-Intensive Applications ch. 3", sections: [] };
    const c = summary({ next: { topic: "documents", status: "todo", unit: 2, reading } });
    const card = cardData(c, []);
    const hero = heroStep(c, unit, [card.lead!, ...card.rest], null)!;
    assert.equal(card.lead?.kind, "Reading");
    assert.deepEqual([hero.kind, hero.title, hero.line], ["reading", "Reading for unit 2", "3 chapters, on your own"]);
    assert.deepEqual(hero.books?.map((b) => [b.book, b.chapters.map((ch) => ch.label)]), [
      ["Designing Data-Intensive Applications", ["Ch. 2", "Ch. 3"]],
      [null, ["The Dynamo paper"]],
    ]);
  });

  test("the hero shows a leading checkpoint, in the checkpoint's unit", () => {
    const due = summary({ next: null, checkpoint: { unit: 2, title: "Data models", result: "pending", left: [], due: true } });
    const items = [cardData(due, []).lead!];
    assert.equal(currentUnit(due, items), 2);
    assert.deepEqual(heroStep(due, unit, items, null), {
      kind: "checkpoint",
      title: "Checkpoint 2",
      line: "An unseen task set from the unit's rubric, done without help",
      chips: [
        { label: "All 2 topics done", detail: null, met: true },
        { label: "Pass the checkpoint", detail: "80% of the rubric", met: false },
      ],
    });
    const failed = summary({
      next: { topic: "x", status: "todo", unit: 3 },
      checkpoint: { unit: 2, title: "Data models", result: "fail", left: [], due: false },
    });
    const fitems = cardData(failed, []).rest;
    const lead = cardData(failed, []).lead!;
    assert.equal(currentUnit(failed, [lead, ...fitems]), 2);
    assert.equal(heroStep(failed, unit, [lead, ...fitems], null)?.chips[1].detail, "Last try: fail");
    assert.equal(heroStep(summary({ next: null, checkpoint: null }), unit, [], null), null);
  });

  test("routines run their /learn command", () => {
    assert.equal(routineCommand("lesson", "llm").command, "/learn:learn llm");
    assert.equal(routineCommand("quick", "llm").command, "/learn:learn llm --quick");
    assert.equal(routineCommand("review", "llm").command, "/learn:review llm");
    assert.equal(routineCommand("checkpoint", "llm").command, "/learn:checkpoint llm");
  });
});

test("the session log records the course files a session wrote", () => {
  const p = new SessionParser("s1", tmp);
  const abs = path.join(tmp, "llm", "lessons", "2026-10-24-matmul-flops.md");
  p.push(JSON.stringify({ type: "user", timestamp: "2026-10-24T10:00:00Z", message: { content: "/learn:learn llm" } }));
  p.push(JSON.stringify({ type: "assistant", timestamp: "2026-10-24T10:05:00Z", message: { content: [{ type: "tool_use", id: "t1", name: "Write", input: { file_path: abs } }] } }));
  assert.deepEqual(p.state.wrote, ["llm/lessons/2026-10-24-matmul-flops.md"]);
  assert.equal(p.state.startedAt, "2026-10-24T10:00:00Z");
  assert.equal(p.state.endedAt, "2026-10-24T10:05:00Z");
});

for (const prefix of ["mcp__plugin_belay_belay__", ...LEGACY_TOOLS]) {
  test(`the session log reads ${prefix}reply as a site reply and ${prefix}show as focus`, () => {
    const p = new SessionParser("s1", tmp);
    const at = "2026-10-24T10:00:00Z";
    const call = (id: string, name: string, input: object) =>
      JSON.stringify({ type: "assistant", uuid: id, timestamp: at, message: { content: [{ type: "tool_use", id, name, input }] } });
    p.push(call("r1", `${prefix}reply`, { text: "Hi there" }));
    p.push(call("s1", `${prefix}show`, { course: "llm", target: "claim", topic: "chain-rule", id: "c4" }));
    p.push(JSON.stringify({ type: "user", timestamp: at, message: { content: [{ type: "tool_result", tool_use_id: "s1" }] } }));
    const reply = p.items.find((i) => i.kind === "message");
    assert.equal(reply?.kind === "message" && reply.surface, "site");
    assert.equal(reply?.kind === "message" && reply.text, "Hi there");
    assert.equal(p.state.focus?.target, "claim");
    assert.equal(p.state.focus?.label, "chain-rule · c4");
  });
}
