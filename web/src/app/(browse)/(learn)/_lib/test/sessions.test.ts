import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { readLesson } from "../sessions.ts";

const tmp = mkdtempSync(path.join(os.tmpdir(), "belay-lessons-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

describe("lesson sessions", () => {
  const grills = path.join(tmp, "Belay", "grills");
  const lessons = path.join(tmp, "Belay", "lessons");
  const write = (root: string, slug: string, doc: object) => {
    mkdirSync(path.join(root, slug), { recursive: true });
    writeFileSync(path.join(root, slug, "session.json"), JSON.stringify(doc));
  };
  write(grills, "a-grill", { topic: "A grill", status: "in-progress" });
  write(lessons, "lesson-llm-20261025-1405", { kind: "lesson", course: "llm", topic: "Lesson · chain-rule", status: "in-progress" });
  mkdirSync(path.join(lessons, "fresh"), { recursive: true });
  writeFileSync(path.join(lessons, "fresh", "bridge.json"), "{}");

  test("a lesson folder reads with its kind and course; a grill's or a bare bridge.json isn't a lesson", () => {
    const l = readLesson(lessons, "lesson-llm-20261025-1405")!;
    assert.equal(l.kind, "lesson");
    assert.equal(l.course, "llm");
    assert.equal(l.topic, "Lesson · chain-rule");
    assert.equal(readLesson(grills, "a-grill"), null);
    assert.equal(readLesson(lessons, "fresh"), null);
  });
});
