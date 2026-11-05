import assert from "node:assert/strict";
import { test } from "node:test";
import { excalidraw } from "../../answer-formats/excalidraw/format.ts";
import { NEW_KINDS, newFilePath } from "../../web/_lib/new-file.ts";

test("the menu lists the diagram format, then the text kinds", () => {
  assert.deepEqual(
    NEW_KINDS.map((k) => [k.label, k.ext, k.icon]),
    [
      ["Diagram", ".excalidraw", "workflow"],
      ["Markdown", ".md", "file-text"],
      ["Text", ".txt", "file"],
      ["Python", ".py", "file-code"],
    ],
  );
  assert.equal(NEW_KINDS[0].body(), excalidraw.template!());
  assert.equal(NEW_KINDS[1].body(), "");
});

test("a typed name gets the kind's extension once, under work/", () => {
  assert.equal(newFilePath("news-feed", ".excalidraw"), "work/news-feed.excalidraw");
  assert.equal(newFilePath("news-feed.excalidraw", ".excalidraw"), "work/news-feed.excalidraw");
  assert.equal(newFilePath("Notes.MD", ".md"), "work/Notes.MD");
  assert.equal(newFilePath(" designs\\feed ", ".md"), "work/designs/feed.md");
  assert.equal(newFilePath("/work/scratch/a.py"), "work/scratch/a.py");
});

test("an empty name or a bare folder makes nothing", () => {
  assert.equal(newFilePath("  ", ".md"), null);
  assert.equal(newFilePath("work/", ".md"), null);
  assert.equal(newFilePath("scratch/", ".md"), null);
});
