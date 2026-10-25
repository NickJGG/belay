import assert from "node:assert/strict";
import { request } from "node:http";
import { after, before, test } from "node:test";
import { startHttp, type BridgeHttp } from "../http.mts";
import type { Message } from "../protocol.mts";

const TOKEN = "t".repeat(48);
const SITE = "http://127.0.0.1:4747";
const got: Message[] = [];
let bridge: BridgeHttp;

before(async () => {
  bridge = await startHttp({
    slug: "demo",
    token: TOKEN,
    origins: [SITE],
    onMessage: async (m) => (m.kind === "chat" && m.text === "refuse" ? "refused" : (got.push(m), null)),
    snapshot: () => [{ type: "working", on: false }],
    status: () => ({ connected: true }),
  });
});
after(() => bridge.close());

type Res = { status: number; headers: Record<string, unknown>; body: string };

function call(method: string, path: string, headers: Record<string, string> = {}, body?: string): Promise<Res> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: "127.0.0.1", port: bridge.port, method, path, headers: { Host: `127.0.0.1:${bridge.port}`, ...headers } },
      (res) => {
        let text = "";
        res.on("data", (c) => (text += c));
        res.on("end", () => resolve({ status: res.statusCode!, headers: res.headers, body: text }));
      },
    );
    req.on("error", reject);
    req.end(body);
  });
}

const post = (body: unknown, headers: Record<string, string> = {}) =>
  call("POST", "/message", { "Content-Type": "application/json", "X-Sear-Token": TOKEN, ...headers }, JSON.stringify(body));

test("status answers without a token", async () => {
  const r = await call("GET", "/status");
  assert.equal(r.status, 200);
  assert.deepEqual(JSON.parse(r.body), { up: true, slug: "demo", connected: true });
});

test("message needs the token", async () => {
  assert.equal((await post({ kind: "chat", slug: "demo", text: "hi" }, { "X-Sear-Token": "" })).status, 401);
  assert.equal((await post({ kind: "chat", slug: "demo", text: "hi" }, { "X-Sear-Token": "x".repeat(48) })).status, 401);
});

test("a valid message is forwarded", async () => {
  const before = got.length;
  const r = await post({ kind: "answer", slug: "demo", q: 2, opt: "b" });
  assert.equal(r.status, 200);
  assert.deepEqual(got.slice(before), [{ kind: "answer", slug: "demo", q: 2, opt: "b" }]);
});

test("invalid, mismatched, refused and oversized messages are not forwarded", async () => {
  const before = got.length;
  assert.equal((await post({ kind: "chat", slug: "demo" })).status, 400);
  assert.equal((await post({ kind: "chat", slug: "other", text: "hi" })).status, 409);
  assert.equal((await post({ kind: "chat", slug: "demo", text: "refuse" })).status, 409);
  assert.equal((await post({ kind: "chat", slug: "demo", text: "x".repeat(70_000) })).status, 413);
  const plain = await call("POST", "/message", { "Content-Type": "text/plain", "X-Sear-Token": TOKEN }, "hi");
  assert.equal(plain.status, 415);
  assert.equal(got.length, before);
});

test("origin: the site is allowed with CORS, others are refused", async () => {
  const fromSite = await post({ kind: "chat", slug: "demo", text: "hi" }, { Origin: SITE });
  assert.equal(fromSite.status, 200);
  assert.equal(fromSite.headers["access-control-allow-origin"], SITE);
  assert.equal((await post({ kind: "chat", slug: "demo", text: "hi" }, { Origin: "https://evil.example" })).status, 403);
  assert.equal((await call("GET", "/status", { Origin: "https://evil.example" })).status, 403);
  const pre = await call("OPTIONS", "/message", { Origin: SITE });
  assert.equal(pre.status, 204);
  assert.match(String(pre.headers["access-control-allow-headers"]), /X-Sear-Token/);
});

test("a non-loopback Host is refused (DNS rebinding)", async () => {
  assert.equal((await call("GET", "/status", { Host: `evil.example:${bridge.port}` })).status, 421);
});

test("events need the token and stream the snapshot, then broadcasts", async () => {
  assert.equal((await call("GET", "/events")).status, 401);
  const text = await new Promise<string>((resolve, reject) => {
    const req = request(
      { host: "127.0.0.1", port: bridge.port, path: `/events?token=${TOKEN}`, headers: { Host: `127.0.0.1:${bridge.port}` } },
      (res) => {
        assert.equal(res.statusCode, 200);
        let buf = "";
        res.on("data", (c) => {
          buf += c;
          if (buf.includes('"reply"')) {
            req.destroy();
            resolve(buf);
          }
        });
        setTimeout(() => bridge.broadcast({ type: "reply", text: "hello" }), 50);
      },
    );
    req.on("error", reject);
    req.end();
  });
  assert.match(text, /data: \{"type":"working","on":false\}/);
  assert.match(text, /data: \{"type":"reply","text":"hello"\}/);
});
