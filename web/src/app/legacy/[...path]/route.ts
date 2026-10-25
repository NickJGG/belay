import { readFile } from "node:fs/promises";
import path from "node:path";
import { grillDir } from "@/lib/config";
import { isSlug } from "@/lib/sessions";

const TYPES: Record<string, string> = {
  ".html": "text/html",
  ".js": "text/javascript",
  ".css": "text/css",
};

/**
 * An old grill session's preview, served over http because a site page can't open file:// links.
 * `/legacy/sessions/<slug>/preview.*` is the session's own file; preview.html loads the shared shell as
 * `../../preview-shell.v1.*`, which lands on `/legacy/preview-shell.v1.*`, from grill's skill folder.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ path: string[] }> }) {
  const parts = (await params).path;
  const sessions = grillDir();
  let file: string | null = null;
  if (parts.length === 3 && parts[0] === "sessions" && isSlug(parts[1]) && /^preview\.[a-z.]+$/.test(parts[2])) {
    file = path.join(sessions, parts[1], parts[2]);
  } else if (parts.length === 1 && /^preview-shell\.v\d+\.(js|css)$/.test(parts[0])) {
    file = path.join(path.dirname(sessions), parts[0]);
  }
  const type = file && TYPES[path.extname(file)];
  if (!file || !type) return new Response("not found", { status: 404 });
  try {
    return new Response(await readFile(file), {
      headers: { "Content-Type": `${type}; charset=utf-8`, "Cache-Control": "no-cache" },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
