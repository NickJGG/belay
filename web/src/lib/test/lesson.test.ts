import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { coursePage, lessonHref, showKey, showPage, toShow } from "../lesson.ts";
import { listSessions, readSession } from "../sessions.ts";
import { missing, pageKind, pageTab } from "../shell.ts";
import { clearQueue, QUEUE_TTL, queueFile, readQueue, writeQueue } from "../start-queue.ts";

const tmp = mkdtempSync(path.join(os.tmpdir(), "belay-lesson-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

describe("lesson sessions", () => {
  const sear = path.join(tmp, "Sear", "sessions");
  const write = (slug: string, doc: object) => {
    mkdirSync(path.join(sear, slug), { recursive: true });
    writeFileSync(path.join(sear, slug, "session.json"), JSON.stringify(doc));
  };
  write("a-grill", { topic: "A grill", status: "in-progress" });
  write("lesson-llm-20261025-1405", { kind: "lesson", course: "llm", topic: "Lesson · chain-rule", status: "in-progress" });
  const root = { dir: sear, source: "sear" as const };

  test("a lesson folder reads with its kind and course, and grill lists leave it out", () => {
    const l = readSession(root, "lesson-llm-20261025-1405")!;
    assert.equal(l.kind, "lesson");
    assert.equal(l.course, "llm");
    assert.equal(l.topic, "Lesson · chain-rule");
    assert.equal(readSession(root, "a-grill")!.kind, undefined);
    assert.deepEqual(
      listSessions([root]).map((s) => s.slug),
      ["a-grill"],
    );
  });
});

describe("Follow along targets", () => {
  test("each show names its page and label", () => {
    assert.deepEqual(showPage({ course: "llm", target: "claim", topic: "chain-rule", id: "c4" }), {
      href: "/courses/llm/knowledge/chain-rule#c4",
      label: "chain-rule · c4",
    });
    assert.deepEqual(showPage({ course: "llm", target: "source", id: "karpathy" }), { href: "/courses/llm/sources/karpathy", label: "karpathy" });
    assert.deepEqual(showPage({ course: "llm", target: "whiteboard" }), { href: "/courses/llm/now", label: "the whiteboard" });
    assert.deepEqual(showPage({ course: "llm", target: "work", path: "work/a b/flops.py" }), {
      href: "/courses/llm/work/a%20b/flops.py",
      label: "work/a b/flops.py",
    });
    assert.equal(showPage({ course: "llm", target: "work", path: "work/../course.md" }), null);
    assert.equal(showPage({ course: "llm", target: "claim", topic: "chain-rule", id: "4" }), null);
  });

  test("toShow takes a lesson's show event and refuses a grill's", () => {
    assert.deepEqual(toShow({ type: "show", course: "llm", target: "claim", topic: "t", id: "c1", extra: 1 }), {
      course: "llm",
      target: "claim",
      topic: "t",
      id: "c1",
    });
    assert.equal(toShow({ type: "show", q: 3, opt: "a" }), null);
    assert.equal(toShow({ type: "reply", course: "llm", target: "whiteboard" }), null);
    assert.notEqual(showKey({ course: "llm", target: "claim", topic: "t", id: "c1" }), showKey({ course: "llm", target: "claim", topic: "t", id: "c2" }));
  });

  test("a lesson's Tab lands on its Now page", () => {
    assert.equal(lessonHref("llm"), "/courses/llm/now");
    assert.equal(coursePage("/courses/llm/knowledge/x"), "llm");
    assert.equal(coursePage("/p/SEAR"), null);
  });
});

describe("the shell and lessons", () => {
  test("the Now page and Work tab are Workspaces; other course pages read", () => {
    assert.equal(pageKind("/courses/llm/now"), "workspace");
    assert.equal(pageKind("/courses/llm/work/flops.py"), "workspace");
    assert.equal(pageKind("/courses/llm/notes"), "reading");
    assert.equal(pageKind("/courses/llm/now/x"), "reading");
  });

  test("a page's Tab: its grill, or the live lesson on its course", () => {
    const live = [{ slug: "g" }, { slug: "lesson-llm-1", course: "llm" }];
    assert.equal(pageTab("/s/g", live), "g");
    assert.equal(pageTab("/courses/llm/knowledge/x", live), "lesson-llm-1");
    assert.equal(pageTab("/courses/other", live), null);
    assert.equal(pageTab("/p/SEAR", live), null);
  });

  test("a missing course's Now page says so", () => {
    assert.equal(missing("/courses/nope/now").what, "No course nope.");
  });
});

describe("the start queue", () => {
  const sessions = path.join(tmp, "q", "sessions");

  test("writes beside the sessions folder, reads back, goes stale and clears", () => {
    assert.equal(readQueue(sessions), null);
    const q = writeQueue(sessions, { label: "Quick review", command: "/learn llm --quick", course: "llm", routine: "quick" }, 1000);
    assert.equal(queueFile(sessions), path.join(tmp, "q", "start.json"));
    assert.deepEqual(readQueue(sessions, 2000), q);
    assert.equal(readQueue(sessions, 1000 + QUEUE_TTL), null);
    clearQueue(sessions);
    assert.equal(readQueue(sessions, 2000), null);
  });

  test("a malformed queue reads as none", () => {
    mkdirSync(path.join(tmp, "q"), { recursive: true });
    writeFileSync(queueFile(sessions), JSON.stringify({ label: "x", command: "y", course: "llm", routine: "nap", at: 1 }));
    assert.equal(readQueue(sessions, 2), null);
  });
});
