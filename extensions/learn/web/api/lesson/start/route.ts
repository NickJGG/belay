import { postToBridge } from "@/lib/bridge-post";
import { runDir } from "@/lib/config";
import { getCourse, topicTitle } from "../../../_lib/courses";
import { navData } from "@/lib/data";
import { announceStart } from "@/lib/hub";
import { routineCommand, type Routine } from "../../../_lib/routines";
import { sameOrigin } from "@/lib/same-origin";
import { clearQueue, readQueue, writeQueue } from "../../../_lib/start-queue";

/**
 * The routine queued for a fresh session (start-queue.ts).
 *   GET     the queue, or null
 *   POST    `{course, routine, wrap?}`: queues it and, if a lesson is live, asks it to restart (wrapping up first if
 *           `wrap`); returns `{queued, live}`. With no live lesson, `belay learn` in a terminal picks it up.
 *   DELETE  cancels: a later `restart` with no queue does nothing
 * Every change is announced to all pages as a `start` event.
 */

export async function GET() {
  return Response.json(readQueue(runDir()));
}

const ROUTINES = new Set<Routine>(["lesson", "quick", "review", "checkpoint"]);

export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "cross-origin" }, { status: 403 });
  const body = (await request.json().catch(() => null)) as { course?: unknown; routine?: unknown; wrap?: unknown } | null;
  const c = typeof body?.course === "string" ? body.course : "";
  const routine = body?.routine as Routine;
  if (!ROUTINES.has(routine) || (body?.wrap !== undefined && typeof body.wrap !== "boolean")) {
    return Response.json({ error: "expected {course, routine, wrap?}" }, { status: 400 });
  }
  const course = getCourse(c);
  if (!course) return Response.json({ error: `no course ${c}` }, { status: 404 });

  const { label, command } = routineCommand(routine, c, course.next ? topicTitle(course, course.next.topic) : undefined, course.checkpoint?.unit);
  const queued = writeQueue(runDir(), { label, command, course: c, routine });
  announceStart(queued);

  const lesson = (await navData()).live.find((l) => l.kind === "lesson" && l.connected);
  if (!lesson) return Response.json({ queued, live: false });
  const res = await postToBridge(lesson.slug, { kind: "restart", label, wrap: body?.wrap === true });
  return Response.json({ queued, live: res.ok, ...(res.ok ? {} : { error: res.error }) });
}

export async function DELETE(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "cross-origin" }, { status: 403 });
  clearQueue(runDir());
  announceStart(null);
  return Response.json({ ok: true });
}
