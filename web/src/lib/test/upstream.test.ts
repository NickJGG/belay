import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { connectUpstream, readBridgeFile, type BridgeEvent, type BridgeFile, type UpstreamState } from "../upstream.ts";

const tmp = mkdtempSync(path.join(os.tmpdir(), "belay-upstream-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

/** A stand-in bridge: `/events` needs the token and streams whatever `push` sends. */
async function fakeBridge(token: string) {
  const streams = new Set<http.ServerResponse>();
  const server = http.createServer((req, res) => {
    if (req.url !== "/events" || req.headers["x-belay-token"] !== token) {
      res.writeHead(401).end();
      return;
    }
    res.writeHead(200, { "Content-Type": "text/event-stream" });
    res.write(": hi\n\n");
    streams.add(res);
    req.on("close", () => streams.delete(res));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return {
    port: (server.address() as AddressInfo).port,
    push: (e: unknown) => {
      for (const s of streams) s.write(`data: ${JSON.stringify(e)}\n\n`);
    },
    drop: () => {
      for (const s of streams) s.destroy();
    },
    close: () => new Promise<void>((r) => server.close(() => r())),
  };
}

function until(check: () => boolean, ms = 2000): Promise<void> {
  const end = Date.now() + ms;
  return new Promise((resolve, reject) => {
    const tick = () => (check() ? resolve() : Date.now() > end ? reject(new Error("timed out")) : setTimeout(tick, 10));
    tick();
  });
}

test("readBridgeFile accepts the bridge's shape and rejects anything else", () => {
  const dir = path.join(tmp, "s");
  assert.equal(readBridgeFile(dir), null);
  mkdirSync(dir);
  writeFileSync(path.join(dir, "bridge.json"), JSON.stringify({ port: 1, token: "t", sessionId: "x", pid: 2, at: "now" }));
  assert.deepEqual(readBridgeFile(dir), { port: 1, token: "t", sessionId: "x", pid: 2, at: "now" });
  writeFileSync(path.join(dir, "bridge.json"), JSON.stringify({ port: "1", token: "t", pid: 2 }));
  assert.equal(readBridgeFile(dir), null);
});

test("an open stream is Live; events update state and pass through; a drop reconnects", async () => {
  const bridge = await fakeBridge("tok");
  const file: BridgeFile = { port: bridge.port, token: "tok", sessionId: null, pid: process.pid, at: "" };
  const events: BridgeEvent[] = [];
  const states: UpstreamState[] = [];
  const up = connectUpstream(file, { onEvent: (e) => events.push(e), onChange: (s) => states.push(s) });
  try {
    await up.ready;
    assert.equal(up.state().up, true);

    bridge.push({ type: "session", slug: "s", sessionId: "abc" });
    bridge.push({ type: "working", on: true });
    await until(() => up.state().working);
    assert.equal(up.state().sessionId, "abc");

    bridge.push({ type: "disconnected", slug: "s", sessionId: "abc" });
    await until(() => !up.state().connected);
    assert.equal(up.state().working, false);
    assert.deepEqual(
      events.map((e) => e.type),
      ["session", "working", "disconnected"],
    );

    bridge.drop();
    await until(() => !up.state().up);
    await until(() => up.state().up, 4000);
  } finally {
    up.close();
    await bridge.close();
  }
});

test("a wrong token or a dead pid is never Live", async () => {
  const bridge = await fakeBridge("tok");
  try {
    const wrong = connectUpstream(
      { port: bridge.port, token: "nope", sessionId: null, pid: process.pid, at: "" },
      { onEvent: () => {}, onChange: () => {} },
    );
    await wrong.ready;
    assert.equal(wrong.state().up, false);
    wrong.close();

    const dead = connectUpstream(
      { port: bridge.port, token: "tok", sessionId: null, pid: 2 ** 22 + 12345, at: "" },
      { onEvent: () => {}, onChange: () => {} },
    );
    await dead.ready;
    assert.equal(dead.state().up, false);
    dead.close();
  } finally {
    await bridge.close();
  }
});

test("the open turn follows the snapshot, step and result events, and clears at turn end", async () => {
  const bridge = await fakeBridge("tok");
  const up = connectUpstream(
    { port: bridge.port, token: "tok", sessionId: null, pid: process.pid, at: "" },
    { onEvent: () => {}, onChange: () => {} },
  );
  try {
    await up.ready;
    assert.equal(up.turn(), null);
    bridge.push({ type: "steps", start: "t0", steps: [{ label: "Read a.ts", at: "t1", verb: "Read", target: "a.ts" }] });
    bridge.push({ type: "step", label: "Saved the session", at: "t2", verb: "Saved the session", id: "e2" });
    bridge.push({ type: "result", id: "e2", meta: "denied", tone: "bad" });
    await until(() => up.turn()?.steps[1]?.meta === "denied");
    assert.deepEqual(up.turn(), {
      start: "t0",
      steps: [
        { label: "Read a.ts", at: "t1", verb: "Read", target: "a.ts" },
        { label: "Saved the session", at: "t2", verb: "Saved the session", id: "e2", meta: "denied", tone: "bad" },
      ],
    });
    bridge.push({ type: "turn", start: "t0", steps: [], ms: 5 });
    await until(() => up.turn() === null);
    bridge.push({ type: "step", label: "Checked the mock", at: "t3" });
    await until(() => up.turn() !== null);
    assert.deepEqual(up.turn(), { start: "t3", steps: [{ label: "Checked the mock", at: "t3" }] });
  } finally {
    up.close();
    await bridge.close();
  }
});
