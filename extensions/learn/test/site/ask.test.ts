import assert from "node:assert/strict";
import { test } from "node:test";
import { excalidraw } from "../../answer-formats/excalidraw/format.ts";
import { parseScene } from "../../answer-formats/excalidraw/scene.ts";
import { askLabel, askMessage } from "../../web/_lib/ask.ts";

test("a label drops the bracketed remark at the end of its line", () => {
  assert.equal(askLabel("Cache"), "Cache");
  assert.equal(askLabel("Queue (ellipse)"), "Queue");
  assert.equal(askLabel("box 2 (no label)"), "box 2");
  assert.equal(askLabel("API → ?  (end unattached; nearest box: DB, 14px)"), "API → ?");
  assert.equal(askLabel('"retry later" (over API)'), '"retry later"');
  assert.equal(askLabel("(x)"), "(x)");
});

test("the message is the question, then the shape's lines from focus", () => {
  const file = excalidraw.write!("Arrows:\n  API → Cache\n  Web → API");
  const api = [...parseScene(file).byId.values()].find((e) => e.type === "rectangle" && excalidraw.focus!(file, e.id)[0] === "API")!;
  const lines = excalidraw.focus!(file, api.id);
  assert.equal(
    askMessage(" Why a cache here? ", askLabel(lines[0]), "work/feed.excalidraw", lines),
    "Why a cache here?\n\nAbout API in work/feed.excalidraw:\n  API\n  API → Cache\n  Web → API",
  );
});
