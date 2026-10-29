/**
 * `<data>/.run/start.json`: the routine the learner started on the site, waiting for a fresh session. `{label, command,
 * course, routine, at}`, `at` in epoch ms; stale after 10 minutes. The site writes and clears it here; the bridge
 * (extensions/learn/bridge/learn.mts) reads it in a lesson's `restart` tool and consumes it when a session starts in the Learning root.
 */
import fs from "node:fs";
import path from "node:path";
import type { Routine } from "./routines.ts";

export type Queue = { label: string; command: string; course: string; routine: Routine; at: number };

export const QUEUE_TTL = 10 * 60 * 1000;
const ROUTINES = new Set(["lesson", "quick", "review", "checkpoint"]);

/** In the run folder, as the bridge's `queueFile()` has it. */
export const queueFile = (runDir: string) => path.join(runDir, "start.json");

/** The queued start, or null if missing, malformed or stale. */
export function readQueue(runDir: string, now = Date.now()): Queue | null {
  try {
    const q = JSON.parse(fs.readFileSync(queueFile(runDir), "utf8"));
    const ok =
      typeof q?.label === "string" &&
      typeof q.command === "string" &&
      typeof q.course === "string" &&
      ROUTINES.has(q.routine) &&
      typeof q.at === "number";
    return ok && now - q.at < QUEUE_TTL ? { label: q.label, command: q.command, course: q.course, routine: q.routine, at: q.at } : null;
  } catch {
    return null;
  }
}

/** Replaces any earlier queued start. */
export function writeQueue(runDir: string, q: Omit<Queue, "at">, now = Date.now()): Queue {
  const queue = { ...q, at: now };
  fs.mkdirSync(runDir, { recursive: true });
  fs.writeFileSync(queueFile(runDir), JSON.stringify(queue));
  return queue;
}

export const clearQueue = (runDir: string) => fs.rmSync(queueFile(runDir), { force: true });
