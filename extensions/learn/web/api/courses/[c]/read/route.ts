import { z } from "zod";
import { courseDir, markRead, SLUG } from "../../../../_lib/courses";
import { sameOrigin } from "@/lib/same-origin";

const Body = z.object({ source: z.string().max(128).regex(SLUG), undo: z.boolean().optional() });

/** Mark read: `{source, undo?}` flips the source's reading lines through the learn skill's `courses.js read`. */
export async function POST(request: Request, ctx: { params: Promise<{ c: string }> }) {
  if (!sameOrigin(request)) return Response.json({ error: "cross-origin" }, { status: 403 });
  const { c } = await ctx.params;
  if (!courseDir(c)) return Response.json({ error: "Not found." }, { status: 404 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "expected {source, undo?}" }, { status: 400 });
  try {
    return Response.json(await markRead(c, parsed.data.source, parsed.data.undo));
  } catch (err) {
    const msg = ((err as { stderr?: string }).stderr || (err as Error).message).trim().replace(/^error: /, "");
    return Response.json({ error: msg }, { status: 422 });
  }
}
