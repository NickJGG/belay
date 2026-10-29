import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import { grill } from "../../kinds/grill.mts";
import { runtime } from "../../kinds/grill.runtime.mts";
import { imagesOf, parseMessage, toChannel } from "../../protocol.mts";
import { stepLabel, Turns, type Record_ } from "../../transcript.mts";

const parse = parseMessage(runtime.messages);
const ok = (m: object) => assert.ok(parse(JSON.stringify(m)), JSON.stringify(m));
const bad = (m: unknown) => assert.equal(parse(JSON.stringify(m)), null);
const channel = (m: { kind: string; slug: string }, dir = ".") => toChannel(m, dir, runtime.head(m.slug, { slug: m.slug }), runtime.format);
const pic = (i = 0) => `20261024T120000-abcde${i}.png`;

test("answer and comment parse", () => {
  ok({ kind: "answer", slug: "s", q: 3, opt: "b1" });
  ok({ kind: "answer", slug: "s", q: 3, opt: "b", note: "but smaller" });
  ok({ kind: "comment", slug: "s", q: 2, opt: "a", selector: "main > .card", text: "Save", note: "move this" });
  ok({ kind: "comment", slug: "s", q: 1, opt: "a", selector: "p", text: "", note: "this", images: [pic()] });
  bad({ kind: "answer", slug: "s", q: 0, opt: "a" });
  bad({ kind: "answer", slug: "s", q: 1.5, opt: "a" });
  bad({ kind: "answer", slug: "s", q: 1, opt: "a b" });
  bad({ kind: "comment", slug: "s", q: 1, opt: "a", selector: "x".repeat(1001), text: "", note: "n" });
  bad({ kind: "comment", slug: "s", q: 1, opt: "a", selector: "p", text: "", note: "" });
  bad({ kind: "comment", slug: "s", q: 1, opt: "a", selector: "p", text: "", note: "", images: [pic()] });
  assert.equal(imagesOf(parse(JSON.stringify({ kind: "answer", slug: "s", q: 1, opt: "a", images: [pic()] }))!).length, 0);
});

test("channel content names the grill; meta carries the question and option", () => {
  const c = channel({ kind: "answer", slug: "my-grill", q: 4, opt: "b", note: "tighter" } as never);
  assert.match(c.content, /^Belay site, grill `my-grill`: picked option b for Q4\./);
  assert.match(c.content, /tighter/);
  assert.deepEqual(c.meta, { slug: "my-grill", kind: "answer", q: "4", opt: "b" });

  const cm = channel({ kind: "comment", slug: "g", q: 1, opt: "a", selector: ".x", text: " Save \n now ", note: "n" } as never);
  assert.match(cm.content, /element `\.x` \("Save now"\)/);
  assert.equal(cm.meta.selector, ".x");

  const dir = path.resolve("sessions", "g", "images");
  const pictured = channel({ kind: "comment", slug: "g", q: 1, opt: "a", selector: "p", text: "", note: "n", images: [pic()] } as never, dir);
  assert.match(pictured.content, /Attached pictures/);
});

test("show takes a question and an optional option", () => {
  const sent: unknown[] = [];
  const ctx = { state: { slug: "g" }, broadcast: (e: unknown) => void sent.push(e), log: () => {} };
  assert.equal(runtime.call!("show", { q: 4, opt: "a" }, ctx)?.content[0].text, "shown");
  assert.ok(runtime.call!("show", { q: 0 }, ctx)?.isError);
  assert.equal(runtime.call!("reply", {}, ctx), undefined);
  assert.deepEqual(sent, [{ type: "show", q: 4, opt: "a" }]);
});

test("attach takes a slug; the grill's page and reattach advice name it", () => {
  assert.deepEqual(runtime.target({ slug: "demo" }), { slug: "demo" });
  assert.equal(runtime.target({ slug: "../x" }), "slug must be lowercase letters, digits and dashes");
  assert.equal(grill.page("demo", { slug: "demo" }), "/s/demo");
  assert.equal(grill.reattach("demo"), "disconnected: run `/grill resume demo` in the terminal");
});

const S = "C:\\Users\\Nick\\Belay\\grills\\demo";
const ctx = { dir: S, label: runtime.stepLabel };
const label = (name: string, input: Record<string, unknown>) => stepLabel(name, input, ctx)?.label ?? null;

test("preview edits update the Qn mock from a Q marker, else the mock", () => {
  assert.equal(label("Edit", { file_path: `${S}\\preview.spec.js`, old_string: "x", new_string: "// Q7 option b\n" }), "Updated the Q7 mock");
  assert.equal(label("Write", { file_path: `${S}\\preview.mock.css`, content: "/* Q12 */ .a{}" }), "Updated the Q12 mock");
  assert.equal(label("Edit", { file_path: `${S}\\preview.data.js`, old_string: "Q3a", new_string: "y" }), "Updated the mock");
  assert.equal(label("MultiEdit", { file_path: `${S}\\preview.spec.js`, edits: [{ old_string: "a", new_string: "Q2" }] }), "Updated the Q2 mock");
  assert.equal(label("Edit", { file_path: `${S}\\sub\\preview.x.js`, old_string: "a", new_string: "b" }), "Edited sub/preview.x.js");
  assert.equal(label("Read", { file_path: `${S}\\preview.spec.js` }), "Read demo/preview.spec.js");
  assert.equal(label("Edit", { file_path: `${S}\\session.json`, old_string: "a", new_string: "b" }), "Saved the session");
});

test("show points to a question", () => {
  assert.deepEqual(stepLabel("mcp__plugin_belay_belay__show", { q: 4 }, ctx), { label: "Pointed to Q4", verb: "Pointed to", target: "Q4" });
  assert.deepEqual(stepLabel("mcp__plugin_belay_belay__show", { q: 4, opt: "b1" }, ctx), {
    label: "Pointed to Q4 · b1",
    verb: "Pointed to",
    target: "Q4 · b1",
  });
});

test("a <channel> site message starts a turn though it is a meta record", () => {
  const at = (s: number) => `2026-10-23T23:21:${String(s).padStart(2, "0")}.000Z`;
  const records: Record_[] = [
    {
      type: "user",
      isMeta: true,
      message: { content: '<channel source="plugin:belay:belay" slug="demo" kind="answer" q="6" opt="a">\nBelay site, grill `demo`: picked option a for Q6.\n</channel>' },
      timestamp: at(0),
    },
    { type: "assistant", message: { content: [{ type: "tool_use", id: "toolu_1", name: "mcp__plugin_belay_belay__show", input: { q: 6, opt: "a" } }] }, timestamp: at(1) },
  ];
  const t = new Turns(ctx);
  assert.deepEqual(records.flatMap((r) => t.push(r)), [
    { type: "busy", on: true },
    { type: "step", label: "Pointed to Q6 · a", verb: "Pointed to", target: "Q6 · a", at: at(1), id: "toolu_1" },
  ]);
  assert.equal(t.start, at(0));
});
