import { postToBridge } from "@/lib/bridge-post";
import { sameOrigin } from "@/lib/same-origin";
import { isSlug } from "@/lib/sessions";

const MAX_BODY = 64 * 1024;

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
  const res = await postToBridge(slug, msg);
  return res.ok ? Response.json({ ok: true }) : Response.json({ error: res.error }, { status: res.status });
}
