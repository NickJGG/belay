import assert from "node:assert/strict";
import { test } from "node:test";
import { excalidraw } from "../../answer-formats/excalidraw/format.ts";
import { formatFor } from "../../answer-formats/index.ts";
import { attemptText, MAX_NOTE, warningsLabel } from "../../web/_lib/attempt.ts";

const ABS = "C:\Learning\sd\work\feed.excalidraw";

test("a text file's attempt names the file", () => {
  assert.equal(attemptText(formatFor("work/a.md"), "# hi", "work/a.md", "C:\a.md"), "Attempt: work/a.md");
});

test("a diagram's attempt carries its summary", () => {
  const file = excalidraw.write!("Arrows:\n  API → Cache");
  const sent = attemptText(excalidraw, file, "work/feed.excalidraw", ABS);
  assert.equal(sent, excalidraw.summarize!(file, "work/feed.excalidraw").text);
  assert.match(sent, /^work\/feed\.excalidraw · /);
  assert.match(sent, /API → Cache/);
});

test("a summary too long for one message sends its header and the command, never a cut summary", () => {
  const spec = `Arrows:\n${Array.from({ length: 200 }, (_, i) => `  Service number ${i} → Service number ${i + 1}`).join("\n")}`;
  const file = excalidraw.write!(spec);
  const full = excalidraw.summarize!(file, "work/feed.excalidraw").text;
  assert.ok(full.length > MAX_NOTE);
  const sent = attemptText(excalidraw, file, "work/feed.excalidraw", ABS);
  assert.equal(sent, `${full.split("\n")[0]}\nToo long for the message: run \`belay work read "${ABS}"\`.`);
  assert.ok(sent.length <= MAX_NOTE);
});

test("an unreadable diagram falls back to naming the file", () => {
  assert.equal(attemptText(excalidraw, "{oops", "work/x.excalidraw", ABS), "Attempt: work/x.excalidraw");
});

test("the warnings chip lists only what's there", () => {
  assert.equal(warningsLabel({ unattached: 0, loose: 0, unreadable: 0 }), null);
  assert.equal(warningsLabel({ unattached: 2, loose: 1, unreadable: 0 }), "2 unattached · 1 loose note");
  assert.equal(warningsLabel({ unattached: 0, loose: 3, unreadable: 1 }), "3 loose notes · 1 unreadable");
});
