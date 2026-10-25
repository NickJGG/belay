import { sessionDir } from "@/lib/config";
import { readChat } from "@/lib/session-files";
import { isSlug } from "@/lib/sessions";

/** A session's chat.jsonl as JSON, re-read by the drawer when the file changes. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const dir = isSlug(slug) ? sessionDir(slug) : null;
  if (!dir) return Response.json([], { status: 404 });
  return Response.json(readChat(dir), { headers: { "Cache-Control": "no-store" } });
}
