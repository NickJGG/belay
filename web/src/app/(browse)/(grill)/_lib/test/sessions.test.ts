import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { byUpdated, type SessionMemo } from "../../../../../lib/sessions.ts";
import { listSessions } from "../sessions.ts";

const tmp = mkdtempSync(path.join(os.tmpdir(), "belay-grills-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

function write(rel: string, text: string) {
  const file = path.join(tmp, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

const md = (fields: Record<string, string>) =>
  `---\n${Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n")}\n---\n\n# Grill session\n`;

describe("listSessions", () => {
  const grills = path.join(tmp, "grills");
  write(
    "grills/new-one/session.json",
    JSON.stringify({
      slug: "new-one",
      topic: "New",
      status: "in-progress",
      project: "kiln",
      started: "2026-10-20",
      updated: "2026-10-23",
      open: "Q2 next",
      mock: { page: "new" },
      questions: [
        { n: 1, title: "First?", short: "First", status: "resolved" },
        { n: 2, title: "Second?", status: "weird" },
      ],
    }),
  );
  write("grills/new-one/new-one.md", md({ topic: "Rendered plan" }));
  write("grills/fresh/bridge.json", "{}");
  write("grills/broken/session.json", "{not json");
  write("grills/Not-A-Slug/session.json", "{}");
  write("grills/old-one/old-one.md", md({ topic: '"Old grill"', status: "abandoned", project: "MAPS", started: "2026-09-01" }));
  write("grills/no-file/preview.html", "");
  write("grills/lesson-llm-20261025-1405/session.json", JSON.stringify({ kind: "lesson", course: "llm" }));

  test("reads session.json, legacy markdown and bare bridge.json folders, and skips lessons", () => {
    const bySlug = new Map(listSessions(grills).map((s) => [s.slug, s]));
    assert.deepEqual([...bySlug.keys()].sort(), ["fresh", "new-one", "old-one"]);

    const n = bySlug.get("new-one")!;
    assert.equal(n.topic, "New");
    assert.equal(n.project, "KILN");
    assert.equal(n.open, "Q2 next");
    assert.equal(n.mock, true);
    assert.equal(n.legacy, false);
    assert.deepEqual(n.questions, [
      { n: 1, title: "First?", short: "First", status: "resolved" },
      { n: 2, title: "Second?", short: "Second?", status: "open" },
    ]);

    const o = bySlug.get("old-one")!;
    assert.equal(o.topic, "Old grill");
    assert.equal(o.legacy, true);
    assert.equal(o.updated, "2026-09-01");
    assert.equal(o.questions, null);

    assert.deepEqual(bySlug.get("fresh"), {
      slug: "fresh",
      topic: "fresh",
      status: "in-progress",
      questions: [],
      mock: false,
      legacy: false,
    });
  });

  test("a lessons folder lists no grills", () => {
    write("lessons/lesson-llm-20261025-1405/session.json", JSON.stringify({ kind: "lesson", course: "llm", topic: "Lesson · chain-rule" }));
    assert.deepEqual(listSessions(path.join(tmp, "lessons")), []);
  });

  test("the memo reuses a parse until the file's mtime changes", () => {
    const memo: SessionMemo = new Map();
    const first = listSessions(grills, memo).find((s) => s.slug === "old-one");
    assert.equal(listSessions(grills, memo).find((s) => s.slug === "old-one"), first);
  });

  test("byUpdated puts the newest first", () => {
    assert.deepEqual(
      listSessions(grills)
        .sort(byUpdated)
        .map((s) => s.slug),
      ["new-one", "old-one", "fresh"],
    );
  });
});
