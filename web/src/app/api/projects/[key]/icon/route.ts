import { readFile } from "node:fs/promises";
import path from "node:path";
import { belay } from "@/lib/data";
import { ICON_TYPES, projectsOf } from "@/lib/projects";

/** A belay project's icon, as `projectsOf` resolved it; the request only names the project. */
export async function GET(request: Request, { params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const icon = projectsOf(belay()).find((p) => p.key === key.toUpperCase())?.icon;
  if (!icon) return new Response("not found", { status: 404 });
  try {
    const body = await readFile(icon);
    return new Response(body, {
      headers: {
        "Content-Type": ICON_TYPES[path.extname(icon).toLowerCase()],
        // ?v=<mtime> changes with the file, so a versioned URL can be kept for good.
        "Cache-Control": new URL(request.url).searchParams.has("v")
          ? "public, max-age=31536000, immutable"
          : "no-cache",
      },
    });
  } catch {
    return new Response("not found", { status: 404 });
  }
}
