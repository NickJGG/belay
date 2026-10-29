import { readCourseFile, splitTitle } from "@/app/(browse)/(learn)/_lib/courses";

const TOPIC = /^[a-z0-9][a-z0-9-]*$/;
const ID = /^c\d+$/;

/** `?topic&id`: the text of claim `^id` in `knowledge/<topic>.md`, without its source citations, and the note's title. */
export async function GET(request: Request, ctx: { params: Promise<{ c: string }> }) {
  const { c } = await ctx.params;
  const q = new URL(request.url).searchParams;
  const topic = q.get("topic") ?? "";
  const id = q.get("id") ?? "";
  if (!TOPIC.test(topic) || !ID.test(id)) return Response.json({ error: "bad topic or id" }, { status: 400 });
  const md = readCourseFile(c, `knowledge/${topic}.md`);
  const end = new RegExp(String.raw`[ \t]\^${id}[ \t]*$`);
  const line = md?.split(/\r?\n/).find((l) => end.test(l));
  if (!line) return Response.json({ error: `no claim ${topic}^${id}` }, { status: 404 });
  const text = line
    .replace(end, "")
    .replace(/\[\[sources\/[^\]]*\]\]\s*"[^"\n]*"/g, "")
    .replace(/\[\[([^\]|]+?)(?:\|([^\]]+))?\]\]/g, (_, target: string, alias?: string) => alias ?? target.split("#")[0].split("/").pop() ?? target)
    .replace(/^\s*(?:[-*+]|\d+\.)\s+/, "")
    .replace(/\s+/g, " ")
    .trim();
  return Response.json({ text, title: splitTitle(md!).title });
}
