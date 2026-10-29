import { readFile } from "node:fs/promises";
import path from "node:path";
import { sessionDir } from "@/lib/config";
import { MOCK_FILES, type MockFile } from "@/app/(browse)/(grill)/_lib/mock";
import { isSlug } from "@/lib/sessions";

/** A session's mock files, for the stage (spec, data) and the frames (CSS). Nothing else in the folder. */
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string; name: string }> }) {
  const { slug, name } = await params;
  const dir = isSlug(slug) && MOCK_FILES.includes(name as MockFile) ? sessionDir(slug) : null;
  if (!dir) return new Response("not found", { status: 404 });
  try {
    const body = await readFile(path.join(dir, name));
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
