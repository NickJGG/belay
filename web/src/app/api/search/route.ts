import { searchIndex } from "@/lib/data";

/**
 * The command palette's names: sessions, projects, issues and courses with what they hold. A cross-origin page can't
 * read it (no CORS headers).
 */
export async function GET() {
  return Response.json(await searchIndex(), { headers: { "Cache-Control": "no-store" } });
}
