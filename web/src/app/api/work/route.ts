import { z } from "zod";
import { sameOrigin } from "@/lib/same-origin";
import { readWork, writeWork } from "@/lib/work";

/** The disk version of a work/ file, for reloading the editor. */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const course = url.searchParams.get("course") ?? "";
  const file = readWork(course, url.searchParams.get("path") ?? "");
  if (!file) return Response.json({ error: "Not found." }, { status: 404 });
  if (file.kind !== "text") return Response.json({ error: "Not a text file." }, { status: 415 });
  return Response.json({ text: file.text, mtime: file.mtime });
}

const Body = z.object({
  course: z.string().max(128),
  path: z.string().max(512),
  text: z.string(),
  base: z.number().nullable(),
  force: z.boolean().optional(),
});

/** Saves a work/ file: `{course, path, text, base, force?}`, see `writeWork`. Same-origin only, like every write. */
export async function PUT(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "cross-origin" }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "expected {course, path, text, base}" }, { status: 400 });
  const { course, path, text, base, force } = parsed.data;
  const result = writeWork(course, path, text, { base, force });
  return Response.json(result, { status: result.ok ? 200 : result.status });
}
