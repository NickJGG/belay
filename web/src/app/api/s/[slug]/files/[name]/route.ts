import { readFile } from "node:fs/promises";
import path from "node:path";
import { searDir } from "@/lib/config";
import { MOCK_FILES, type MockFile } from "@/lib/mock";
import { isSlug } from "@/lib/sessions";

/** A Sear session's mock files, for the stage (spec, data) and the frames (CSS). Nothing else in the folder. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; name: string }> }) {
  const { slug, name } = await params;
  if (!isSlug(slug) || !MOCK_FILES.includes(name as MockFile)) return new Response("not found", { status: 404 });
  try {
    const body = await readFile(path.join(searDir(), slug, name));
    return new Response(body, {
      headers: {
        "Content-Type": `${name.endsWith(".css") ? "text/css" : "text/javascript"}; charset=utf-8`,
        // The page busts the cache with ?v=<mtime>; a stale copy without it would hide the latest edit.
        "Cache-Control": "no-cache",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
