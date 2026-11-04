/** Drives the compiled plugin server (plugin/bridge/server.mjs) over stdio, with a throwaway home and data dir. */
import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVER = fileURLToPath(new URL("../../plugin/bridge/server.mjs", import.meta.url));
const root = mkdtempSync(path.join(os.tmpdir(), "belay-bridge-"));
const home = path.join(root, "home");
const data = path.join(root, "data");
const sessions = path.join(data, "grills");
const lessons = path.join(data, "lessons");
const cwd = path.join(root, "work");
const logDir = path.join(home, ".claude", "projects", cwd.replace(/[^a-zA-Z0-9]/g, "-"));
const bridgeFile = path.join(sessions, "demo", "bridge.json");
// This process spawns the server, so it plays the Claude Code process whose session file the bridge reads.
const ownerFile = path.join(home, ".claude", "sessions", `${process.pid}.json`);
const setOwner = (sessionId: string) => writeFileSync(ownerFile, JSON.stringify({ pid: process.pid, sessionId }));

type Note = { method: string; params?: Record<string, unknown> };
const notes: Note[] = [];
let client: Client;

const env = { ...process.env, USERPROFILE: home, HOME: home, BELAY_DATA: data } as Record<string, string>;
delete env.CLAUDE_PROJECT_DIR;
// Without it, focus never runs the real script against this machine's terminal tabs.
delete env.WT_SESSION;

type Maybe<T> = T | undefined | null | false;
async function waitFor<T>(what: string, check: () => Maybe<T> | Promise<Maybe<T>>, ms = 5000): Promise<T> {
  const end = Date.now() + ms;
  for (;;) {
    const v = await check();
    if (v) return v;
    if (Date.now() > end) throw new Error(`timed out waiting for ${what}`);
    await new Promise((r) => setTimeout(r, 50));
  }
}

const textOf = (r: unknown) => (r as { content: { text: string }[] }).content[0].text;
const toolNames = async () => (await client.listTools()).tools.map((t) => t.name).sort();
const bridge = () => JSON.parse(readFileSync(bridgeFile, "utf8"));

function post(body: unknown, token = bridge().token) {
  const { port } = bridge();
  return fetch(`http://127.0.0.1:${port}/message`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Belay-Token": token },
    body: JSON.stringify(body),
  });
}

before(async () => {
  mkdirSync(logDir, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  mkdirSync(path.dirname(ownerFile), { recursive: true });
  mkdirSync(data, { recursive: true });
  writeFileSync(path.join(data, "settings.yaml"), "extensions: { learn: on }\n");
  setOwner("session-one");
  client = new Client({ name: "lifecycle-test", version: "0" });
  client.fallbackNotificationHandler = async (n) => void notes.push(n as Note);
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], cwd, env, stderr: "ignore" }));
  // The session that calls attach has just written its transcript.
  writeFileSync(path.join(logDir, "session-one.jsonl"), "{}\n");
});

after(async () => {
  await client?.close();
  rmSync(root, { recursive: true, force: true });
});

test("idle: only attach is listed and no bridge.json exists", async () => {
  assert.deepEqual(await toolNames(), ["attach"]);
  assert.ok(!existsSync(bridgeFile));
  const bad = await client.callTool({ name: "attach", arguments: { slug: "../x" } });
  assert.ok(bad.isError);
  const early = await client.callTool({ name: "reply", arguments: { text: "hi" } }).catch((e: Error) => e);
  assert.ok(early instanceof Error || (early as { isError?: boolean }).isError);
});

test("attach writes bridge.json, opens a port and announces the tools", async () => {
  const r = await client.callTool({ name: "attach", arguments: { slug: "demo" } });
  assert.match(textOf(r), /^attached demo/);
  const b = bridge();
  assert.equal(b.sessionId, "session-one");
  assert.equal(b.wt, false);
  assert.match(b.token, /^[0-9a-f]{48}$/);
  assert.equal(typeof b.port, "number");
  assert.notEqual(b.pid, process.pid);
  await waitFor("list_changed", () => notes.some((n) => n.method === "notifications/tools/list_changed"));
  assert.deepEqual(await toolNames(), ["attach", "choice", "detach", "reply", "show"]);
  const status = await (await fetch(`http://127.0.0.1:${b.port}/status`)).json();
  // Claude calls attach mid-turn, so the bridge starts out busy.
  assert.deepEqual(status, { up: true, slug: "demo", connected: true, sessionId: "session-one", working: true });
});

test("a site message becomes a channel notification and is logged", async () => {
  assert.equal((await post({ kind: "chat", slug: "demo", text: "hello" }, "0".repeat(48))).status, 401);
  assert.equal((await post({ kind: "answer", slug: "demo", q: 3, opt: "b", note: "smaller" })).status, 200);
  const n = await waitFor("channel notification", () => notes.find((x) => x.method === "notifications/claude/channel"));
  assert.match(String(n.params?.content), /^Belay site, grill `demo`: picked option b for Q3/);
  assert.deepEqual(n.params?.meta, { slug: "demo", kind: "answer", q: "3", opt: "b" });
  const chat = readFileSync(path.join(sessions, "demo", "chat.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.equal(chat.at(-1).from, "site");
  assert.equal(chat.at(-1).note, "smaller");
});

test("a message naming a missing picture is refused; a present one is listed by path", async () => {
  const name = "20261024T120000-abcdef.png";
  const missing = await post({ kind: "chat", slug: "demo", text: "", images: [name] });
  assert.equal(missing.status, 409);
  assert.match((await missing.json()).error, /picture 20261024T120000-abcdef\.png not found/);
  const dir = path.join(sessions, "demo", "images");
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, name), "png");
  const before = notes.length;
  assert.equal((await post({ kind: "chat", slug: "demo", text: "see", images: [name] })).status, 200);
  const n = await waitFor("channel notification", () => notes.slice(before).find((x) => x.method === "notifications/claude/channel"));
  assert.ok(String(n.params?.content).includes(path.join(dir, name)));
  const chat = readFileSync(path.join(sessions, "demo", "chat.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  assert.deepEqual(chat.at(-1).images, [name]);
});

test("reply and choice reach /events; a choice answer must match an open choice", async () => {
  const { port, token } = bridge();
  const ac = new AbortController();
  const res = await fetch(`http://127.0.0.1:${port}/events`, { headers: { "X-Belay-Token": token }, signal: ac.signal });
  const reader = res.body!.getReader();
  let seen = "";
  const until = async (re: RegExp) => {
    while (!re.test(seen)) seen += new TextDecoder().decode((await reader.read()).value);
  };
  await until(/"type":"working","on":true/);

  await client.callTool({ name: "reply", arguments: { text: "got it" } });
  await until(/"type":"reply","text":"got it"/);
  const c = await client.callTool({ name: "choice", arguments: { prompt: "Ship?", options: ["Yes", "No"] } });
  const id = /choice ([0-9a-f]{6})/.exec(textOf(c))![1];
  await until(/"type":"choice"/);
  await client.callTool({ name: "show", arguments: { q: 4, opt: "a" } });
  await until(/"type":"show","q":4,"opt":"a"/);
  ac.abort();

  assert.equal((await post({ kind: "choice", slug: "demo", id, option: "Maybe" })).status, 409);
  assert.equal((await post({ kind: "choice", slug: "demo", id, option: "Yes" })).status, 200);
  assert.equal((await post({ kind: "choice", slug: "demo", id, option: "Yes" })).status, 409);
  assert.equal((await post({ kind: "permission", slug: "demo", request_id: "abcde", behavior: "allow" })).status, 409);
});

test("the transcript's steps stream as SSE, and the turn's end clears working and logs a steps entry", async () => {
  const { port, token } = bridge();
  const status = async () => (await (await fetch(`http://127.0.0.1:${port}/status`)).json()).working;
  assert.equal(await status(), true, "a reply no longer ends the turn");
  const ac = new AbortController();
  const res = await fetch(`http://127.0.0.1:${port}/events`, { headers: { "X-Belay-Token": token }, signal: ac.signal });
  const reader = res.body!.getReader();
  let seen = "";
  const until = async (re: RegExp) => {
    while (!re.test(seen)) seen += new TextDecoder().decode((await reader.read()).value);
  };
  // A page opened mid-turn gets the open turn in the snapshot.
  await until(/"type":"steps","start":"[^"]+","steps":\[\]/);

  const t0 = new Date(Date.now() + 1000).toISOString();
  const t1 = new Date(Date.now() + 3000).toISOString();
  const transcript = path.join(logDir, "session-one.jsonl");
  const record = (r: unknown) => appendFileSync(transcript, JSON.stringify(r) + "\n");
  record({ type: "assistant", timestamp: t0, message: { content: [{ type: "tool_use", id: "t1", name: "Read", input: { file_path: "C:\\a\\b\\c.ts" } }] } });
  record({ type: "user", timestamp: t0, message: { content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }] } });
  record({ type: "assistant", timestamp: t0, message: { content: [{ type: "tool_use", id: "t2", name: "mcp__plugin_belay_belay__reply", input: { text: "x" } }] } });
  await until(/"type":"step","label":"Read b\/c.ts"/);
  record({ type: "system", subtype: "turn_duration", timestamp: t1 });
  await until(/"type":"turn".*"steps":\[\{"label":"Read b\/c.ts"/);
  await until(/"type":"working","on":false/);
  ac.abort();
  assert.ok(!seen.includes("plugin_belay_belay"), "hidden tools add no step");
  assert.equal(await status(), false);

  const chat = readFileSync(path.join(sessions, "demo", "chat.jsonl"), "utf8").trim().split("\n").map((l) => JSON.parse(l));
  const entry = chat.at(-1);
  assert.equal(entry.from, "claude");
  assert.equal(entry.kind, "steps");
  assert.deepEqual(entry.steps, [{ label: "Read b/c.ts", verb: "Read", target: "b/c.ts", at: t0, id: "t1" }]);
  assert.equal(entry.ms, Date.parse(t1) - Date.parse(entry.start));
  assert.equal(entry.interrupted, undefined);
});

const connected = async (port: number) => (await (await fetch(`http://127.0.0.1:${port}/status`)).json()).connected;

test("another session's transcript in the same folder doesn't disconnect", async () => {
  writeFileSync(path.join(logDir, "other-session.jsonl"), "{}\n");
  await new Promise((r) => setTimeout(r, 4500));
  assert.equal(await connected(bridge().port), true);
});

test("the owner's session id changing (/clear) disconnects; attach reconnects", async () => {
  writeFileSync(path.join(logDir, "session-two.jsonl"), "{}\n");
  setOwner("session-two");
  const { port } = bridge();
  await waitFor("disconnect", async () => !(await connected(port)), 6000);
  const refused = await post({ kind: "chat", slug: "demo", text: "anyone?" });
  assert.equal(refused.status, 409);
  assert.match((await refused.json()).error, /grill resume demo/);
  assert.ok((await client.callTool({ name: "reply", arguments: { text: "x" } })).isError);
  // Focus is handled before the connected check: here it gets as far as the missing WT_SESSION.
  const focus = await post({ kind: "focus", slug: "demo" });
  assert.equal(focus.status, 409);
  assert.equal((await focus.json()).error, "not in Windows Terminal");

  const again = await client.callTool({ name: "attach", arguments: { slug: "demo" } });
  assert.match(textOf(again), /re-attached/);
  assert.equal(bridge().sessionId, "session-two");
  assert.equal((await post({ kind: "chat", slug: "demo", text: "back" })).status, 200);
});

test("detach closes the port, removes bridge.json and hides the tools", async () => {
  const { port } = bridge();
  const step = { type: "tool_use", id: "t3", name: "Grep", input: { pattern: "foo" } };
  appendFileSync(path.join(logDir, "session-two.jsonl"), JSON.stringify({ type: "assistant", message: { content: [step] } }) + "\n");
  assert.match(textOf(await client.callTool({ name: "detach", arguments: {} })), /^detached demo/);
  const last = JSON.parse(readFileSync(path.join(sessions, "demo", "chat.jsonl"), "utf8").trim().split("\n").at(-1)!);
  assert.equal(last.kind, "steps");
  assert.equal(last.interrupted, true, "detach flushes the open turn");
  assert.deepEqual(last.steps.map((s: { label: string }) => s.label), ["Searched foo"]);
  assert.ok(!existsSync(bridgeFile));
  await assert.rejects(fetch(`http://127.0.0.1:${port}/status`));
  assert.deepEqual(await toolNames(), ["attach"]);
});

test("without an owner file, attach uses the claimed session id and ignores junk", async () => {
  const home2 = path.join(root, "home2");
  const logDir2 = path.join(home2, ".claude", "projects", cwd.replace(/[^a-zA-Z0-9]/g, "-"));
  mkdirSync(logDir2, { recursive: true });
  const other = new Client({ name: "fallback-test", version: "0" });
  const env2 = { ...env, USERPROFILE: home2, HOME: home2 };
  await other.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], cwd, env: env2, stderr: "ignore" }));
  try {
    writeFileSync(path.join(logDir2, "newest.jsonl"), "{}\n");
    const file = path.join(sessions, "fallback", "bridge.json");
    await other.callTool({ name: "attach", arguments: { slug: "fallback", sessionId: "${CLAUDE_SESSION_ID}" } });
    assert.equal(JSON.parse(readFileSync(file, "utf8")).sessionId, "newest");
    await other.callTool({ name: "attach", arguments: { slug: "fallback", sessionId: "0b94d081-e8c3-4d9c" } });
    assert.equal(JSON.parse(readFileSync(file, "utf8")).sessionId, "0b94d081-e8c3-4d9c");
  } finally {
    await other.close();
  }
});

test("a settings change announces the tools again", async () => {
  const count = () => notes.filter((n) => n.method === "notifications/tools/list_changed").length;
  const before = count();
  writeFileSync(path.join(data, "settings.yaml"), "extensions: { learn: on }\ntheme: dark\n");
  await waitFor("list_changed", () => count() > before);
  assert.deepEqual(await toolNames(), ["attach"]);
});

test("bridge.json is removed when Claude Code exits", async () => {
  await client.callTool({ name: "attach", arguments: { slug: "demo" } });
  assert.ok(existsSync(bridgeFile));
  await client.close();
  await waitFor("bridge.json removed", () => !existsSync(bridgeFile));
});

test("a lesson: a queued start runs in the Learning root, attach by course, show, attempt, restart and detach", async () => {
  const learning = path.join(root, "learning");
  const course = path.join(learning, "demo-course");
  mkdirSync(path.join(course, "knowledge"), { recursive: true });
  writeFileSync(path.join(course, "course.md"), "# Demo\n");
  writeFileSync(path.join(course, "knowledge", "topic.md"), "# Topic\n\nA claim. ^c1\n");
  const queue = path.join(data, ".run", "start.json");
  mkdirSync(path.dirname(queue), { recursive: true });
  writeFileSync(queue, JSON.stringify({ label: "Quick review", command: "/learn:learn demo-course --quick", course: "demo-course", routine: "quick", at: Date.now() }));

  const got: Note[] = [];
  const lc = new Client({ name: "lesson-test", version: "0" });
  lc.fallbackNotificationHandler = async (n) => void got.push(n as Note);
  const env3 = { ...env, LEARNING_ROOT: learning };
  await lc.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], cwd: learning, env: env3, stderr: "ignore" }));
  try {
    const cmd = await waitFor("queued command", () => got.find((n) => n.params?.meta && (n.params.meta as Record<string, string>).kind === "command"));
    assert.deepEqual(cmd.params?.meta, { kind: "command", course: "demo-course", command: "/learn:learn demo-course --quick" });
    assert.ok(!existsSync(queue), "the start is consumed");

    assert.ok((await lc.callTool({ name: "attach", arguments: { slug: "x", course: "demo-course" } })).isError);
    assert.ok((await lc.callTool({ name: "attach", arguments: { course: "no-such" } })).isError);
    const r = await lc.callTool({ name: "attach", arguments: { course: "demo-course", topic: "Quick review" } });
    const slug = /^attached (lesson-demo-course-\d{8}-\d{4}):/.exec(textOf(r))?.[1];
    assert.ok(slug, textOf(r));
    assert.match(textOf(r), /\/learn\/demo-course\/now$/);
    const doc = JSON.parse(readFileSync(path.join(lessons, slug, "session.json"), "utf8"));
    assert.deepEqual([doc.kind, doc.course, doc.topic, doc.status], ["lesson", "demo-course", "Quick review", "in-progress"]);
    assert.deepEqual((await lc.listTools()).tools.map((t) => t.name).sort(), ["attach", "choice", "detach", "reply", "restart", "show"]);

    assert.match(textOf(await lc.callTool({ name: "show", arguments: { target: "claim", topic: "topic", id: "c9" } })), /no claim \^c9/);
    assert.equal(textOf(await lc.callTool({ name: "show", arguments: { target: "claim", topic: "topic", id: "c1" } })), "shown");
    const { port, token } = JSON.parse(readFileSync(path.join(lessons, slug, "bridge.json"), "utf8"));
    const ac = new AbortController();
    const res = await fetch(`http://127.0.0.1:${port}/events`, { headers: { "X-Belay-Token": token }, signal: ac.signal });
    const reader = res.body!.getReader();
    let seen = "";
    while (!/"type":"show","course":"demo-course","target":"claim"/.test(seen)) seen += new TextDecoder().decode((await reader.read()).value);
    ac.abort();

    const send = (body: unknown) =>
      fetch(`http://127.0.0.1:${port}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Belay-Token": token },
        body: JSON.stringify(body),
      });
    const before = got.length;
    assert.equal((await send({ kind: "attempt", slug, path: "work/flops.py", text: "Attempt: work/flops.py" })).status, 200);
    const n = await waitFor("attempt", () => got.slice(before).find((x) => x.method === "notifications/claude/channel"));
    assert.deepEqual(n.params?.meta, { slug, kind: "attempt", course: "demo-course", path: "work/flops.py" });

    assert.match(textOf(await lc.callTool({ name: "restart", arguments: {} })), /^cancelled/);
    assert.match(textOf(await lc.callTool({ name: "detach", arguments: {} })), /^detached/);
    assert.equal(JSON.parse(readFileSync(path.join(lessons, slug, "session.json"), "utf8")).status, "done");

    // Idle again: a start queued after the session began (`belay learn`, then the button) is picked up too.
    const commands = () => got.filter((x) => (x.params?.meta as Record<string, string> | undefined)?.kind === "command");
    writeFileSync(queue, JSON.stringify({ label: "Card review", command: "/learn:review demo-course", course: "demo-course", routine: "review", at: Date.now() }));
    const later = await waitFor("a later queued command", () => commands()[1]);
    assert.equal((later.params?.meta as Record<string, string>).command, "/learn:review demo-course");
    assert.ok(!existsSync(queue));
  } finally {
    await lc.close();
  }
});

test("a grill refuses lesson messages and tools", async () => {
  const other = new Client({ name: "grill-test", version: "0" });
  await other.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], cwd, env, stderr: "ignore" }));
  try {
    await other.callTool({ name: "attach", arguments: { slug: "plain" } });
    assert.ok((await other.callTool({ name: "restart", arguments: {} })).isError);
    const { port, token } = JSON.parse(readFileSync(path.join(sessions, "plain", "bridge.json"), "utf8"));
    const r = await fetch(`http://127.0.0.1:${port}/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Belay-Token": token },
      body: JSON.stringify({ kind: "attempt", slug: "plain", path: "work/x.py" }),
    });
    assert.equal(r.status, 409);
  } finally {
    await other.close();
  }
});

test("learn off: no lesson tools or instructions, an attach by course is refused, and no queued start is polled", async () => {
  const settings = path.join(data, "settings.yaml");
  const learning = path.join(root, "learning");
  mkdirSync(path.join(learning, "demo-course"), { recursive: true });
  writeFileSync(path.join(learning, "demo-course", "course.md"), "# Demo\n");
  const queue = path.join(data, ".run", "start.json");
  mkdirSync(path.dirname(queue), { recursive: true });
  writeFileSync(settings, "extensions: { learn: off }\n");
  writeFileSync(queue, JSON.stringify({ label: "Quick review", command: "/learn:learn demo-course --quick", course: "demo-course", routine: "quick", at: Date.now() }));

  const got: Note[] = [];
  const off = new Client({ name: "learn-off-test", version: "0" });
  off.fallbackNotificationHandler = async (n) => void got.push(n as Note);
  const env4 = { ...env, LEARNING_ROOT: learning };
  await off.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], cwd: learning, env: env4, stderr: "ignore" }));
  try {
    assert.doesNotMatch(off.getInstructions() ?? "", /lesson|\/learn/i);
    const { tools } = await off.listTools();
    assert.deepEqual(tools.map((t) => t.name), ["attach"]);
    assert.deepEqual(Object.keys((tools[0].inputSchema as { properties: object }).properties).sort(), ["id", "sessionId", "slug"]);
    assert.doesNotMatch(tools[0].description ?? "", /lesson/);

    const r = await off.callTool({ name: "attach", arguments: { course: "demo-course" } });
    assert.ok(r.isError);
    assert.match(textOf(r), /lessons are switched off/);

    // Past the idle poller's startup delay and a poll: nothing is sent and the queue stays.
    await new Promise((resolve) => setTimeout(resolve, 3500));
    assert.ok(!got.some((n) => (n.params?.meta as Record<string, string> | undefined)?.kind === "command"));
    assert.ok(existsSync(queue));
  } finally {
    await off.close();
    rmSync(queue, { force: true });
  }
});

test("a lesson attached when learn goes off keeps its tools and can re-attach until it detaches", async () => {
  const settings = path.join(data, "settings.yaml");
  const learning = path.join(root, "learning");
  writeFileSync(settings, "extensions: { learn: on }\n");
  const got: Note[] = [];
  const lc = new Client({ name: "learn-switch-test", version: "0" });
  lc.fallbackNotificationHandler = async (n) => void got.push(n as Note);
  const env5 = { ...env, LEARNING_ROOT: learning };
  await lc.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], cwd: learning, env: env5, stderr: "ignore" }));
  const names = async () => (await lc.listTools()).tools.map((t) => t.name).sort();
  const changes = () => got.filter((n) => n.method === "notifications/tools/list_changed").length;
  try {
    assert.ok(!(await lc.callTool({ name: "attach", arguments: { course: "demo-course" } })).isError);
    const before = changes();
    writeFileSync(settings, "extensions: { learn: off }\n");
    await waitFor("list_changed", () => changes() > before);
    assert.deepEqual(await names(), ["attach", "choice", "detach", "reply", "restart", "show"]);
    assert.equal(textOf(await lc.callTool({ name: "show", arguments: { target: "whiteboard" } })), "shown");
    assert.match(textOf(await lc.callTool({ name: "attach", arguments: { course: "demo-course" } })), /^re-attached/);

    assert.match(textOf(await lc.callTool({ name: "detach", arguments: {} })), /^detached/);
    assert.deepEqual(await names(), ["attach"]);
    const again = await lc.callTool({ name: "attach", arguments: { course: "demo-course" } });
    assert.ok(again.isError);
    assert.match(textOf(again), /lessons are switched off/);
  } finally {
    await lc.close();
    writeFileSync(settings, "extensions: { learn: on }\n");
  }
});

test("grill off: no grill tools or instructions, an attach by slug is refused, and a lesson still attaches with choice", async () => {
  const settings = path.join(data, "settings.yaml");
  const learning = path.join(root, "learning");
  writeFileSync(settings, "extensions: { learn: on, grill: off }\n");
  const gc = new Client({ name: "grill-off-test", version: "0" });
  await gc.connect(new StdioClientTransport({ command: process.execPath, args: [SERVER], cwd: learning, env: { ...env, LEARNING_ROOT: learning }, stderr: "ignore" }));
  try {
    assert.doesNotMatch(gc.getInstructions() ?? "", /grill/i);
    const { tools } = await gc.listTools();
    assert.deepEqual(tools.map((t) => t.name), ["attach"]);
    assert.ok(!("slug" in (tools[0].inputSchema as { properties: object }).properties));
    assert.doesNotMatch(tools[0].description ?? "", /grill/);

    const r = await gc.callTool({ name: "attach", arguments: { slug: "plain" } });
    assert.ok(r.isError);
    assert.match(textOf(r), /grills are switched off/);

    assert.match(textOf(await gc.callTool({ name: "attach", arguments: { course: "demo-course" } })), /^attached lesson-/);
    assert.deepEqual((await gc.listTools()).tools.map((t) => t.name).sort(), ["attach", "choice", "detach", "reply", "restart", "show"]);
    assert.match(textOf(await gc.callTool({ name: "detach", arguments: {} })), /^detached/);
  } finally {
    await gc.close();
    writeFileSync(settings, "extensions: { learn: on }\n");
  }
});
