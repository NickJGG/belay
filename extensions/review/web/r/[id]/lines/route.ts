import { contextLines } from "../../../_lib/detail.server";

/** `?n=&from=&to=`: context lines around finding `n`'s saved hunk, read live from the repo. Read-only. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const q = new URL(request.url).searchParams;
  const lines = contextLines(id, Number(q.get("n")), Number(q.get("from")), Number(q.get("to")));
  return lines ? Response.json({ lines }) : Response.json({ error: "no such lines" }, { status: 404 });
}
