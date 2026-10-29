import fs from "node:fs";
import { z } from "zod";
import { sameOrigin } from "@/lib/same-origin";
import { startRun } from "@/app/(browse)/(learn)/_lib/run-process";
import { workPath } from "@/app/(browse)/(learn)/_lib/work";

const Body = z.object({ course: z.string().max(128), path: z.string().max(512) });

/**
 * Runs a work/ file (`{course, path}`, see `startRun`) and streams NDJSON `RunEvent`s. Never an
 * attempt: nothing reaches Claude. Aborting the request (Stop, leaving the page) kills the run.
 */
export async function POST(request: Request) {
  if (!sameOrigin(request)) return Response.json({ error: "cross-origin" }, { status: 403 });
  const parsed = Body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "expected {course, path}" }, { status: 400 });
  const abs = workPath(parsed.data.course, parsed.data.path);
  if (!abs) return Response.json({ error: "Only files under work/ can run." }, { status: 400 });
  if (!fs.existsSync(abs)) return Response.json({ error: "Not found." }, { status: 404 });

  const encoder = new TextEncoder();
  let stop: (() => void) | null = null;
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      let open = true;
      stop = startRun(abs, (e) => {
        if (!open) return;
        try {
          controller.enqueue(encoder.encode(JSON.stringify(e) + "\n"));
          if ("exit" in e) controller.close();
        } catch {
          // The page went away mid-run.
        }
        if ("exit" in e) open = false;
      });
      if (!stop) {
        open = false;
        controller.enqueue(encoder.encode(JSON.stringify({ s: "err", t: "This file doesn't run.\n" }) + "\n"));
        controller.close();
        return;
      }
      request.signal.addEventListener("abort", () => stop?.());
    },
    cancel() {
      stop?.();
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
