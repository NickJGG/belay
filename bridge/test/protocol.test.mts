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

const parse = parseMessage();
const ok = (m: object) => assert.ok(parse(JSON.stringify(m)), JSON.stringify(m));
const bad = (m: unknown) => assert.equal(parse(typeof m === "string" ? m : JSON.stringify(m)), null);
const grill = (slug: string) => ({ head: `Belay site, grill \`${slug}\``, meta: {} });

test("accepts each core message kind", () => {
  ok({ kind: "chat", slug: "s", text: "hi" });
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
  bad({ kind: "answer", slug: "s", q: 3, opt: "b" });
  bad({ kind: "chat", text: "no slug" });
  bad({ kind: "chat", slug: "Bad Slug", text: "x" });
  bad({ kind: "chat", slug: "../etc", text: "x" });
  bad({ kind: "chat", slug: "s", text: "   " });
  bad({ kind: "chat", slug: "s", text: "x".repeat(8001) });
  bad({ kind: "choice", slug: "s", id: "a1b2c3" });
  bad({ kind: "choice", slug: "s", id: "a1b2c3", option: "Yes", text: "and" });
  bad({ kind: "choice", slug: "s", id: "nothex", option: "Yes" });
  bad({ kind: "permission", slug: "s", request_id: "abcdl", behavior: "allow" });
  bad({ kind: "permission", slug: "s", request_id: "abcde", behavior: "maybe" });
});

test("channel content opens with the session's head; meta carries slug, kind and the session's own", () => {
  assert.match(toChannel({ kind: "choice", slug: "g", id: "abcdef", option: "Yes" }, ".", grill("g")).content, /chose "Yes"/);
  assert.match(toChannel({ kind: "chat", slug: "g", text: "hello" }, ".", grill("g")).content, /^Belay site, grill `g`:\n\nhello$/);
  const c = toChannel({ kind: "chat", slug: "l", text: "hi" }, ".", { head: "Belay site, lesson `l` on c", meta: { course: "c" } });
  assert.deepEqual(c.meta, { slug: "l", kind: "chat", course: "c" });
  const typed = toChannel({ kind: "choice", slug: "g", id: "abcdef", text: "neither" }, ".", grill("g"));
  assert.equal(typed.content, "Belay site, grill `g`: dismissed choice abcdef and wrote:\n\nneither");
  assert.deepEqual(typed.meta, { slug: "g", kind: "choice", id: "abcdef" });
});

test("a session kind's message goes to its format; one nobody formats throws", () => {
  const format = (m: { kind: string }, head: string, meta: Record<string, string>) =>
    m.kind === "wave" ? { content: `${head}: waved.`, meta: { ...meta, hand: "left" } } : undefined;
  const c = toChannel({ kind: "wave", slug: "g" }, ".", grill("g"), format);
  assert.deepEqual(c, { content: "Belay site, grill `g`: waved.", meta: { slug: "g", kind: "wave", hand: "left" } });
  assert.throws(() => toChannel({ kind: "nod", slug: "g" }, ".", grill("g"), format), /no notification for a nod message/);
});

const pic = (i = 0) => `20261024T120000-abcde${i}.png`;

test("chat and a typed choice answer take pictures", () => {
  ok({ kind: "chat", slug: "s", text: "", images: [pic()] });
  ok({ kind: "chat", slug: "s", text: "look", images: [pic(), pic(1)] });
  ok({ kind: "choice", slug: "s", id: "a1b2c3", text: "like this", images: [pic()] });
  bad({ kind: "chat", slug: "s", text: "" });
  bad({ kind: "chat", slug: "s", text: " ", images: [] });
  bad({ kind: "chat", slug: "s", text: "x", images: ["../secret.png"] });
  bad({ kind: "chat", slug: "s", text: "x", images: ["20261024T120000-abcdef.pdf"] });
  bad({ kind: "chat", slug: "s", text: "x", images: Array.from({ length: MAX_IMAGES + 1 }, (_, i) => pic(i)) });
  bad({ kind: "choice", slug: "s", id: "a1b2c3", option: "Yes", images: [pic()] });
  assert.equal(imagesOf(parse(JSON.stringify({ kind: "permission", slug: "s", request_id: "abcde", behavior: "allow", images: [pic()] }))!).length, 0);
});

test("attached pictures are listed as absolute paths to Read", () => {
  const dir = path.resolve("sessions", "g", "images");
  const c = toChannel({ kind: "chat", slug: "g", text: "see", images: [pic(), pic(1)] }, dir, grill("g"));
  assert.equal(
    c.content,
    `Belay site, grill \`g\`:\n\nsee\n\nAttached pictures (Read each before answering):\n- ${path.join(dir, pic())}\n- ${path.join(dir, pic(1))}`,
  );
  assert.equal(c.meta.images, "2");
  const only = toChannel({ kind: "chat", slug: "g", text: "", images: [pic()] }, dir, grill("g"));
  assert.match(only.content, /^Belay site, grill `g`: sent 1 picture\.\n\nAttached pictures/);
  assert.equal(toChannel({ kind: "chat", slug: "g", text: "hi" }, dir, grill("g")).meta.images, undefined);
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
