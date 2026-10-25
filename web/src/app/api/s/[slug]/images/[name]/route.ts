import { readFile, rm } from "node:fs/promises";
import path from "node:path";
import { parseChat } from "@/lib/chat";
import { sessionDir } from "@/lib/config";
import { IMAGE_NAME, MIME_OF } from "@/lib/images";
import { sameOrigin } from "@/lib/same-origin";
import { isSlug } from "@/lib/sessions";

type Params = { params: Promise<{ slug: string; name: string }> };

/** The session's folder, or null for a bad slug or name. */
const folder = (slug: string, name: string) => (isSlug(slug) && IMAGE_NAME.test(name) ? sessionDir(slug) : null);
const notFound = () => new Response("not found", { status: 404 });

export async function GET(_request: Request, { params }: Params) {
  const { slug, name } = await params;
  const dir = folder(slug, name);
  if (!dir) return notFound();
  try {
    const body = await readFile(path.join(dir, "images", name));
    return new Response(body, {
      headers: {
        "Content-Type": MIME_OF[name.split(".").pop()!],
        // Names are never reused.
        "Cache-Control": "private, max-age=31536000, immutable",
      },
    });
  } catch {
    return notFound();
  }
}

/** Removes a tray picture; one a sent message names stays. */
export async function DELETE(request: Request, { params }: Params) {
  const { slug, name } = await params;
  if (!sameOrigin(request)) return Response.json({ error: "cross-origin" }, { status: 403 });
  const dir = folder(slug, name);
  if (!dir) return Response.json({ error: "not found" }, { status: 404 });
  const chat = await readFile(path.join(dir, "chat.jsonl"), "utf8").catch(() => "");
  if (parseChat(chat).some((e) => Array.isArray(e.images) && e.images.includes(name))) {
    return Response.json({ error: "a sent message uses this picture" }, { status: 409 });
  }
  await rm(path.join(dir, "images", name), { force: true });
  return Response.json({ ok: true });
}
