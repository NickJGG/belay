import { recordUsage } from "@/lib/hub";
import { parseStatusLine } from "@/lib/usage";

const MAX_BODY = 64 * 1024;
const LOOPBACK = new Set(["127.0.0.1", "localhost"]);

function loopbackHost(request: Request): boolean {
  const host = request.headers.get("host");
  if (!host) return false;
  try {
    return LOOPBACK.has(new URL(`http://${host}`).hostname);
  } catch {
    return false;
  }
}

/**
 * statusline.sh's second POST: the status line JSON, every tick. No token; a browser always sends
 * `Origin` on a cross-site POST and the status line never does, so any `Origin` is refused.
 */
export async function POST(request: Request) {
  if (!loopbackHost(request) || request.headers.has("origin")) return Response.json({ error: "forbidden" }, { status: 403 });
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return Response.json({ error: "JSON only" }, { status: 415 });
  }
  const raw = await request.text();
  if (raw.length > MAX_BODY) return Response.json({ error: "too large" }, { status: 413 });
  let payload;
  try {
    payload = parseStatusLine(JSON.parse(raw));
  } catch {}
  if (!payload) return Response.json({ error: "bad payload" }, { status: 400 });
  recordUsage(payload);
  return new Response(null, { status: 204 });
}
