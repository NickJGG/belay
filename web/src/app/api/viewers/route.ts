import { viewerCount } from "@/lib/hub";

/** `{pages}`: how many pages are open, so `/grill` opens the site only when none is watching. */
export async function GET() {
  return Response.json({ pages: viewerCount() }, { headers: { "Cache-Control": "no-store" } });
}
