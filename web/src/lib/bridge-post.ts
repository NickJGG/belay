import "server-only";
import http from "node:http";
import { sessionDir } from "./config";
import { readBridgeFile } from "./upstream";

export type BridgeReply = { ok: true } | { ok: false; status: number; error: string };

function post(port: number, token: string, body: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/message",
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Belay-Token": token, "Content-Length": Buffer.byteLength(body) },
        timeout: 5000,
      },
      (res) => {
        let text = "";
        res.setEncoding("utf8");
        res.on("data", (c: string) => (text += c));
        res.on("end", () => resolve({ status: res.statusCode ?? 502, text }));
      },
    );
    req.on("timeout", () => req.destroy(new Error("bridge timed out")));
    req.on("error", reject);
    req.end(body);
  });
}

/** Posts one message to the slug's bridge, adding the slug and the token, which never reach the browser. */
export async function postToBridge(slug: string, msg: Record<string, unknown>): Promise<BridgeReply> {
  const dir = sessionDir(slug);
  const bridge = dir ? readBridgeFile(dir) : null;
  if (!bridge) return { ok: false, status: 409, error: `Not attached: run \`/grill resume ${slug}\` in the terminal` };
  try {
    const res = await post(bridge.port, bridge.token, JSON.stringify({ ...msg, slug }));
    if (res.status === 200 || res.status === 204) return { ok: true };
    let error = res.text;
    try {
      error = JSON.parse(res.text).error ?? error;
    } catch {}
    return { ok: false, status: res.status, error: error || `bridge answered ${res.status}` };
  } catch (err) {
    return { ok: false, status: 502, error: `Bridge unreachable: ${(err as Error).message}` };
  }
}
