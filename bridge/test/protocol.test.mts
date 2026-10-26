import assert from "node:assert/strict";
import path from "node:path";
import { test } from "node:test";
import {
  createChoices,
  hostAllowed,
  imagesOf,
  MAX_IMAGES,
  originAllowed,
  parseMessage,
  siteOrigins,
  tokenMatches,
  toChannel,
} from "../protocol.mts";

const ok = (m: object) => assert.ok(parseMessage(JSON.stringify(m)), JSON.stringify(m));
const bad = (m: unknown) => assert.equal(parseMessage(typeof m === "string" ? m : JSON.stringify(m)), null);

test("accepts each message kind", () => {
  ok({ kind: "chat", slug: "s", text: "hi" });
  ok({ kind: "answer", slug: "s", q: 3, opt: "b1" });
  ok({ kind: "answer", slug: "s", q: 3, opt: "b", note: "but smaller" });
  ok({ kind: "comment", slug: "s", q: 2, opt: "a", selector: "main > .card", text: "Save", note: "move this" });
  ok({ kind: "choice", slug: "s", id: "a1b2c3", option: "Yes" });
  ok({ kind: "choice", slug: "s", id: "a1b2c3", text: "neither" });
  ok({ kind: "permission", slug: "s", request_id: "abcde", behavior: "allow" });
  ok({ kind: "focus", slug: "s" });
});

test("a focus message carries nothing but its slug", () => {
  bad({ kind: "focus", slug: "s", transcript: "C:/elsewhere.jsonl" });
  bad({ kind: "focus" });
});

test("rejects malformed, unknown and oversized messages", () => {
  bad("not json");
  bad(null);
  bad({ kind: "shell", slug: "s", text: "x" });
  bad({ kind: "chat", text: "no slug" });
  bad({ kind: "chat", slug: "Bad Slug", text: "x" });
  bad({ kind: "chat", slug: "../etc", text: "x" });
  bad({ kind: "chat", slug: "s", text: "   " });
  bad({ kind: "chat", slug: "s", text: "x".repeat(8001) });
  bad({ kind: "answer", slug: "s", q: 0, opt: "a" });
  bad({ kind: "answer", slug: "s", q: 1.5, opt: "a" });
  bad({ kind: "answer", slug: "s", q: 1, opt: "a b" });
  bad({ kind: "comment", slug: "s", q: 1, opt: "a", selector: "x".repeat(1001), text: "", note: "n" });
  bad({ kind: "comment", slug: "s", q: 1, opt: "a", selector: "p", text: "", note: "" });
  bad({ kind: "choice", slug: "s", id: "a1b2c3" });
  bad({ kind: "choice", slug: "s", id: "a1b2c3", option: "Yes", text: "and" });
  bad({ kind: "choice", slug: "s", id: "nothex", option: "Yes" });
  bad({ kind: "permission", slug: "s", request_id: "abcdl", behavior: "allow" });
  bad({ kind: "permission", slug: "s", request_id: "abcde", behavior: "maybe" });
});

test("channel content names the site and session; meta carries slug and kind", () => {
  const c = toChannel({ kind: "answer", slug: "my-grill", q: 4, opt: "b", note: "tighter" });
  assert.match(c.content, /^Belay site, grill `my-grill`: picked option b for Q4\./);
  assert.match(c.content, /tighter/);
  assert.deepEqual(c.meta, { slug: "my-grill", kind: "answer", q: "4", opt: "b" });

  const cm = toChannel({ kind: "comment", slug: "g", q: 1, opt: "a", selector: ".x", text: " Save \n now ", note: "n" });
  assert.match(cm.content, /element `\.x` \("Save now"\)/);
  assert.equal(cm.meta.selector, ".x");

  assert.match(toChannel({ kind: "choice", slug: "g", id: "abcdef", option: "Yes" }).content, /chose "Yes"/);
  assert.match(toChannel({ kind: "chat", slug: "g", text: "hello" }).content, /^Belay site, grill `g`:\n\nhello$/);
});

const pic = (i = 0) => `20261024T120000-abcde${i}.png`;

test("chat, comment and a typed choice answer take pictures", () => {
  ok({ kind: "chat", slug: "s", text: "", images: [pic()] });
  ok({ kind: "chat", slug: "s", text: "look", images: [pic(), pic(1)] });
  ok({ kind: "comment", slug: "s", q: 1, opt: "a", selector: "p", text: "", note: "this", images: [pic()] });
  ok({ kind: "choice", slug: "s", id: "a1b2c3", text: "like this", images: [pic()] });
  bad({ kind: "chat", slug: "s", text: "" });
  bad({ kind: "chat", slug: "s", text: " ", images: [] });
  bad({ kind: "chat", slug: "s", text: "x", images: ["../secret.png"] });
  bad({ kind: "chat", slug: "s", text: "x", images: ["20261024T120000-abcdef.pdf"] });
  bad({ kind: "chat", slug: "s", text: "x", images: Array.from({ length: MAX_IMAGES + 1 }, (_, i) => pic(i)) });
  bad({ kind: "comment", slug: "s", q: 1, opt: "a", selector: "p", text: "", note: "", images: [pic()] });
  bad({ kind: "choice", slug: "s", id: "a1b2c3", option: "Yes", images: [pic()] });
  assert.equal(imagesOf(parseMessage(JSON.stringify({ kind: "answer", slug: "s", q: 1, opt: "a", images: [pic()] }))!).length, 0);
});

test("attached pictures are listed as absolute paths to Read", () => {
  const dir = path.resolve("sessions", "g", "images");
  const c = toChannel({ kind: "chat", slug: "g", text: "see", images: [pic(), pic(1)] }, dir);
  assert.equal(
    c.content,
    `Belay site, grill \`g\`:\n\nsee\n\nAttached pictures (Read each before answering):\n- ${path.join(dir, pic())}\n- ${path.join(dir, pic(1))}`,
  );
  assert.equal(c.meta.images, "2");
  const only = toChannel({ kind: "chat", slug: "g", text: "", images: [pic()] }, dir);
  assert.match(only.content, /^Belay site, grill `g`: sent 1 picture\.\n\nAttached pictures/);
  assert.match(toChannel({ kind: "comment", slug: "g", q: 1, opt: "a", selector: "p", text: "", note: "n", images: [pic()] }, dir).content, /Attached pictures/);
  assert.equal(toChannel({ kind: "chat", slug: "g", text: "hi" }, dir).meta.images, undefined);
});

test("choices resolve once, and only to one of their options", () => {
  const c = createChoices();
  const id = c.open(["Yes", "No"]);
  assert.match(id, /^[0-9a-f]{6}$/);
  assert.match(c.resolve({ kind: "choice", slug: "s", id, option: "Maybe" })!, /not an option/);
  assert.equal(c.resolve({ kind: "choice", slug: "s", id, option: "No" }), null);
  assert.match(c.resolve({ kind: "choice", slug: "s", id, option: "No" })!, /no open choice/);
  const free = c.open(["A", "B"]);
  assert.equal(c.resolve({ kind: "choice", slug: "s", id: free, text: "something else" }), null);
});

test("token, origin and host checks", () => {
  assert.ok(tokenMatches("abc", "abc"));
  assert.ok(!tokenMatches("abd", "abc"));
  assert.ok(!tokenMatches("ab", "abc"));
  assert.ok(!tokenMatches(undefined, "abc"));
  assert.ok(!tokenMatches(["abc"], "abc"));

  const origins = siteOrigins(4747);
  assert.ok(originAllowed(undefined, origins));
  assert.ok(originAllowed("http://127.0.0.1:4747", origins));
  assert.ok(originAllowed("http://localhost:4747", origins));
  assert.ok(!originAllowed("http://localhost:3000", origins));
  assert.ok(!originAllowed("https://evil.example", origins));
  assert.ok(!originAllowed("null", origins));

  assert.ok(hostAllowed("127.0.0.1:5000", 5000));
  assert.ok(hostAllowed("localhost:5000", 5000));
  assert.ok(!hostAllowed("evil.example:5000", 5000));
  assert.ok(!hostAllowed(undefined, 5000));
});

test("lesson messages: attempt and restart parse, and a lesson's channel names its course", () => {
  ok({ kind: "attempt", slug: "lesson-c-20261025-1200", path: "work/flops.py" });
  ok({ kind: "attempt", slug: "l", path: "work/a/b.md", text: "Attempt: work/a/b.md" });
  ok({ kind: "restart", slug: "l", label: "Quick review", wrap: true });
  bad({ kind: "attempt", slug: "l", path: "knowledge/x.md" });
  bad({ kind: "attempt", slug: "l", path: "work/../course.md" });
  bad({ kind: "restart", slug: "l", label: " " });

  const lesson = { course: "llm-architecture" };
  const a = toChannel({ kind: "attempt", slug: "l", path: "work/flops.py" }, ".", lesson);
  assert.match(a.content, /^Belay site, lesson `l` on llm-architecture: submitted `work\/flops\.py`/);
  assert.deepEqual(a.meta, { slug: "l", kind: "attempt", course: "llm-architecture", path: "work/flops.py" });
  const r = toChannel({ kind: "restart", slug: "l", label: "Card review", wrap: true }, ".", lesson);
  assert.deepEqual(r.meta, { slug: "l", kind: "restart", course: "llm-architecture", wrap: "true" });
  assert.equal(toChannel({ kind: "chat", slug: "l", text: "hi" }, ".", lesson).meta.course, "llm-architecture");
});
