import { searchIndex } from "@/lib/data";

/** The jump-to palette's index: every session and project. A cross-origin page can't read it (no CORS headers). */
export async function GET() {
  return Response.json(await searchIndex(), { headers: { "Cache-Control": "no-store" } });
}
