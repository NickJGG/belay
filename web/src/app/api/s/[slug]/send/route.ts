import http from "node:http";
import path from "node:path";
import { searDir } from "@/lib/config";
import { sameOrigin } from "@/lib/same-origin";
import { isSlug } from "@/lib/sessions";
import { readBridgeFile } from "@/lib/upstream";

const MAX_BODY = 64 * 1024;

function post(port: number, token: string, body: string): Promise<{ status: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      {
        host: "127.0.0.1",
        port,
        path: "/message",
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Sear-Token": token, "Content-Length": Buffer.byteLength(body) },
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

/**
 * Forwards one site message (any bridge `kind`, without `slug`) to the session's bridge, adding the slug and
 * the token, which never reach the browser. The bridge validates the message itself.
 */
export async function POST(request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isSlug(slug)) return Response.json({ error: "bad slug" }, { status: 404 });
  if (!sameOrigin(request)) return Response.json({ error: "cross-origin" }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "JSON only" }, { status: 415 });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) return Response.json({ error: "too large" }, { status: 413 });
  let msg: Record<string, unknown>;
  try {
    msg = JSON.parse(raw);
    if (!msg || typeof msg !== "object" || Array.isArray(msg)) throw new Error();
  } catch {
    return Response.json({ error: "bad JSON" }, { status: 400 });
  }
  const bridge = readBridgeFile(path.join(searDir(), slug));
  if (!bridge) return Response.json({ error: `Not attached: run \`/sear resume ${slug}\` in the terminal` }, { status: 409 });
  try {
    const res = await post(bridge.port, bridge.token, JSON.stringify({ ...msg, slug }));
    if (res.status === 200 || res.status === 204) return Response.json({ ok: true });
    let error = res.text;
    try {
      error = JSON.parse(res.text).error ?? error;
    } catch {}
    return Response.json({ error: error || `bridge answered ${res.status}` }, { status: res.status });
  } catch (err) {
    return Response.json({ error: `Bridge unreachable: ${(err as Error).message}` }, { status: 502 });
  }
}
