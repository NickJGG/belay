import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { inLearningRoot, kind as learn, queueFile } from "../../bridge/learn.mts";
import { readQueue, runtime, showError, writeLessonSession, type LessonState } from "../../bridge/learn.runtime.mts";
import { parseMessage, toChannel } from "../../../../bridge/protocol.mts";

const root = mkdtempSync(path.join(os.tmpdir(), "belay-learn-kind-"));
const learning = path.join(root, "Learning");
const env = { BELAY_DATA: process.env.BELAY_DATA, LEARNING_ROOT: process.env.LEARNING_ROOT };

before(() => {
  process.env.BELAY_DATA = path.join(root, "Belay");
  process.env.LEARNING_ROOT = learning;
  const course = path.join(learning, "c");
  mkdirSync(path.join(course, "knowledge"), { recursive: true });
  mkdirSync(path.join(course, "work"), { recursive: true });
  writeFileSync(path.join(course, "course.md"), "# C\n");
  writeFileSync(path.join(course, "knowledge", "topic.md"), "# Topic\n\nA claim. ^c1\n");
  writeFileSync(path.join(course, "work", "a.py"), "x\n");
});
after(() => {
  Object.assign(process.env, env);
  rmSync(root, { recursive: true, force: true });
});

const parse = parseMessage(runtime.messages);
const ok = (m: object) => assert.ok(parse(JSON.stringify(m)), JSON.stringify(m));
const bad = (m: unknown) => assert.equal(parse(JSON.stringify(m)), null);
const state: LessonState = { course: "llm-architecture" };
const channel = (m: { kind: string; slug: string }) => toChannel(m, ".", runtime.head(m.slug, state), runtime.format);

test("attempt and restart parse, and a lesson's channel names its course", () => {
  ok({ kind: "attempt", slug: "lesson-c-20261025-1200", path: "work/flops.py" });
  ok({ kind: "attempt", slug: "l", path: "work/a/b.md", text: "Attempt: work/a/b.md" });
  ok({ kind: "restart", slug: "l", label: "Quick review", wrap: true });
  bad({ kind: "attempt", slug: "l", path: "knowledge/x.md" });
  bad({ kind: "attempt", slug: "l", path: "work/../course.md" });
  bad({ kind: "restart", slug: "l", label: " " });

  const a = channel({ kind: "attempt", slug: "l", path: "work/flops.py" } as never);
  assert.match(a.content, /^Belay site, lesson `l` on llm-architecture: submitted `work\/flops\.py`/);
  assert.deepEqual(a.meta, { slug: "l", kind: "attempt", course: "llm-architecture", path: "work/flops.py" });
  const r = channel({ kind: "restart", slug: "l", label: "Card review", wrap: true } as never);
  assert.deepEqual(r.meta, { slug: "l", kind: "restart", course: "llm-architecture", wrap: "true" });
  assert.equal(channel({ kind: "chat", slug: "l", text: "hi" } as never).meta.course, "llm-architecture");
  assert.ok(runtime.exclusive, "a grill refuses lesson messages");
});

test("attach takes an existing course and a trimmed topic; the page is the course's now", () => {
  assert.deepEqual(runtime.target({ course: "c", topic: "  Quick review " }), { course: "c", topic: "Quick review" });
  assert.deepEqual(runtime.target({ course: "c", topic: " " }), { course: "c" });
  assert.equal(runtime.target({ course: "no-such" }), `no course no-such in ${learning}`);
  assert.match(runtime.slug({ course: "c" }), /^lesson-c-\d{8}-\d{4}$/);
  assert.equal(learn.page("x", { course: "c" }), "/learn/c/now");
  assert.ok(inLearningRoot(learning));
  assert.ok(!inLearningRoot(path.join(learning, "c")));
});

test("show checks its target exists, and is replayed to a page that connects later", () => {
  assert.equal(showError("c", { target: "claim", topic: "topic", id: "c1" }), null);
  assert.equal(showError("c", { target: "claim", topic: "topic", id: "c9" }), "no claim ^c9 in knowledge/topic.md");
  assert.equal(showError("c", { target: "work", path: "work/a.py" }), null);
  assert.equal(showError("c", { target: "work", path: "course.md" }), "path must be inside c/work/");
  const s: LessonState = { course: "c" };
  const sent: unknown[] = [];
  const ctx = { state: s, broadcast: (e: unknown) => void sent.push(e), log: () => {} };
  assert.ok(runtime.call!("show", { target: "claim", topic: "topic", id: "c9" }, ctx)?.isError);
  assert.equal(runtime.call!("show", { target: "whiteboard" }, ctx)?.content[0].text, "shown");
  assert.deepEqual(sent, [{ type: "show", course: "c", target: "whiteboard" }]);
  assert.deepEqual(runtime.snapshot!(s), sent);
});

test("restart without a queued start is cancelled; the queue goes stale after ten minutes", () => {
  const ctx = { state: { course: "c" }, broadcast: () => {}, log: () => {} };
  assert.equal(runtime.call!("restart", {}, ctx)?.content[0].text, "cancelled: the learner cancelled the start");
  mkdirSync(path.dirname(queueFile()), { recursive: true });
  const q = { label: "Quick review", command: "/learn:learn c --quick", course: "c", routine: "quick" };
  writeFileSync(queueFile(), JSON.stringify({ ...q, at: Date.now() }));
  assert.deepEqual(readQueue(), { ...q, at: readQueue()!.at });
  writeFileSync(queueFile(), JSON.stringify({ ...q, at: Date.now() - 11 * 60 * 1000 }));
  assert.equal(readQueue(), null);
});

test("the session.json opens in progress, keeps its fields on a patch and closes done", () => {
  const dir = path.join(root, "Belay", "lessons", "lesson-c-1");
  runtime.opened!(dir, { course: "c" });
  const doc = () => JSON.parse(readFileSync(path.join(dir, "session.json"), "utf8"));
  assert.deepEqual([doc().kind, doc().course, doc().topic, doc().status], ["lesson", "c", "Lesson · c", "in-progress"]);
  const s: LessonState = { course: "c" };
  runtime.reattached!(dir, s, { course: "c", topic: "Card review" });
  assert.equal(s.topic, "Card review");
  assert.equal(doc().topic, "Card review");
  runtime.closed!(dir);
  writeLessonSession(dir, {});
  assert.deepEqual([doc().status, doc().course], ["done", "c"]);
});
