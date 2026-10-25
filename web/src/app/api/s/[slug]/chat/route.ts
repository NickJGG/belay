import path from "node:path";
import { searDir } from "@/lib/config";
import { readChat } from "@/lib/session-files";
import { isSlug } from "@/lib/sessions";

/** A Sear session's chat.jsonl as JSON, re-read by the drawer when the file changes. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  if (!isSlug(slug)) return Response.json([], { status: 404 });
  return Response.json(readChat(path.join(searDir(), slug)), { headers: { "Cache-Control": "no-store" } });
}
