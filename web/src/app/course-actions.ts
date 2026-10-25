"use server";
/** Course actions that touch this machine, not belay's data, so they sit outside `actions.ts`'s CLI wrappers. */
import { spawn } from "node:child_process";
import { courseDir, fileCreated } from "@/lib/courses";
import { sessionFor } from "@/lib/session-log";

const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/**
 * Resume conversation on a lesson note: a terminal in the course folder running `claude --resume <id>`
 * for the session that wrote the note. `command` comes back for copying when no terminal could start; `error`
 * when no session is known.
 */
export async function resumeLesson(course: unknown, slug: unknown): Promise<{ started?: boolean; command?: string; error?: string }> {
  if (typeof course !== "string" || typeof slug !== "string" || !/^[a-z0-9][a-z0-9-]*$/i.test(slug)) return { error: "bad lesson" };
  const dir = courseDir(course);
  if (!dir) return { error: `no course ${course}` };
  const rel = `lessons/${slug}.md`;
  const id = sessionFor(course, rel, fileCreated(course, rel));
  if (!id || !SESSION_ID.test(id)) return { error: "No conversation found for this lesson." };
  const command = `claude --resume ${id}`;
  if (process.platform !== "win32") return { command };
  const started = await new Promise<boolean>((resolve) => {
    // Windows Terminal; its arguments are an argv, so nothing is parsed by a shell.
    const child = spawn("wt.exe", ["-d", dir, "claude", "--resume", id], { detached: true, stdio: "ignore" });
    child.once("error", () => resolve(false));
    child.once("spawn", () => {
      child.unref();
      resolve(true);
    });
  });
  return started ? { started } : { command };
}
