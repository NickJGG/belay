/** Drives the compiled plugin server (plugin/bridge/server.mjs) over stdio, with a throwaway home and sessions dir. */
import assert from "node:assert/strict";
import { appendFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";
import { fileURLToPath } from "node:url";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVER = fileURLToPath(new URL("../../plugin/bridge/server.mjs", import.meta.url));
const root = mkdtempSync(path.join(os.tmpdir(), "sear-bridge-"));
const home = path.join(root, "home");
const sessions = path.join(root, "sessions");
const cwd = path.join(root, "work");
const logDir = path.join(home, ".claude", "projects", cwd.replace(/[^a-zA-Z0-9]/g, "-"));
const bridgeFile = path.join(sessions, "demo", "bridge.json");
// This process spawns the server, so it plays the Claude Code process whose session file the bridge reads.
const ownerFile = path.join(home, ".claude", "sessions", `${process.pid}.json`);
const setOwner = (sessionId: string) => writeFileSync(ownerFile, JSON.stringify({ pid: process.pid, sessionId }));

type Note = { method: string; params?: Record<string, unknown> };
const notes: Note[] = [];
let client: Client;

const env = { ...process.env, USERPROFILE: home, HOME: home, SEAR_SESSIONS_DIR: sessions } as Record<string, string>;
delete env.CLAUDE_PROJECT_DIR;

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
    headers: { "Content-Type": "application/json", "X-Sear-Token": token },
    body: JSON.stringify(body),
  });
}

before(async () => {
  mkdirSync(logDir, { recursive: true });
  mkdirSync(cwd, { recursive: true });
  mkdirSync(path.dirname(ownerFile), { recursive: true });
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
  assert.match(String(n.params?.content), /^Sear site, session `demo`: picked option b for Q3/);
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
  const res = await fetch(`http://127.0.0.1:${port}/events`, { headers: { "X-Sear-Token": token }, signal: ac.signal });
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
  const res = await fetch(`http://127.0.0.1:${port}/events`, { headers: { "X-Sear-Token": token }, signal: ac.signal });
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
  record({ type: "assistant", timestamp: t0, message: { content: [{ type: "tool_use", id: "t2", name: "mcp__plugin_sear_sear__reply", input: { text: "x" } }] } });
  await until(/"type":"step","label":"Read b\/c.ts"/);
  record({ type: "system", subtype: "turn_duration", timestamp: t1 });
  await until(/"type":"turn".*"steps":\[\{"label":"Read b\/c.ts"/);
  await until(/"type":"working","on":false/);
  ac.abort();
  assert.ok(!seen.includes("plugin_sear_sear"), "hidden tools add no step");
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
  assert.match((await refused.json()).error, /sear resume demo/);
  assert.ok((await client.callTool({ name: "reply", arguments: { text: "x" } })).isError);

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

test("bridge.json is removed when Claude Code exits", async () => {
  await client.callTool({ name: "attach", arguments: { slug: "demo" } });
  assert.ok(existsSync(bridgeFile));
  await client.close();
  await waitFor("bridge.json removed", () => !existsSync(bridgeFile));
});
