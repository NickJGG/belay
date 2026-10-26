/**
 * Lessons on the bridge: the Learning root, the `show` targets a lesson may point the site at, and the start flow.
 *
 * Starting a routine from the site restarts into a fresh session: the site writes `~/Belay/.run/start.json`, the
 * lesson's `restart` tool writes `~/Belay/.run/restart` and ends `claude`, `belay claude`'s loop relaunches it, and the new bridge
 * (idle, in the Learning root) consumes the queue and sends it as a `kind="command"` message.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { learningRoot, queueFile, restartFile, runDir } from "./files.mjs";
export { learningRoot };
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
export const courseExists = (course) => SLUG.test(course) && existsSync(path.join(learningRoot(), course, "course.md"));
export const Show = z.object({
    target: z.enum(["claim", "whiteboard", "work", "source"]),
    topic: z.string().optional(),
    id: z.string().optional(),
    path: z.string().max(512).optional(),
});
/** Why a lesson's `show` points at nothing in `course`, or null if its target exists. */
export function showError(course, s) {
    const dir = path.join(learningRoot(), course);
    const { target, topic = "", id = "", path: rel = "" } = s;
    if (target === "claim") {
        if (!SLUG.test(topic) || !/^c\d+$/.test(id))
            return "claim needs topic (a knowledge slug) and id (cN)";
        let md;
        try {
            md = readFileSync(path.join(dir, "knowledge", `${topic}.md`), "utf8");
        }
        catch {
            return `no knowledge/${topic}.md in ${course}`;
        }
        return new RegExp(String.raw `[ \t]\^${id}[ \t]*$`, "m").test(md) ? null : `no claim ^${id} in knowledge/${topic}.md`;
    }
    if (target === "source") {
        if (!SLUG.test(id))
            return "source needs id (a source slug)";
        return existsSync(path.join(dir, "sources", `${id}.md`)) ? null : `no sources/${id}.md in ${course}`;
    }
    if (target === "work") {
        const work = path.join(dir, "work") + path.sep;
        const file = path.resolve(dir, rel);
        if (!rel || !file.toLowerCase().startsWith(work.toLowerCase()))
            return `path must be inside ${course}/work/`;
        return existsSync(file) && statSync(file).isFile() ? null : `no file ${path.relative(dir, file)} in ${course}`;
    }
    return null;
}
// --- start queue and restart ---------------------------------------------------
const QUEUE_TTL = 10 * 60 * 1000;
const Queue = z.object({
    label: z.string().max(128),
    command: z.string().max(256),
    course: z.string().max(128),
    routine: z.string().max(32),
    at: z.number(),
});
/** The site's queued start, or null if missing, malformed or older than 10 minutes. */
export function readQueue() {
    try {
        const q = Queue.parse(JSON.parse(readFileSync(queueFile(), "utf8")));
        return Date.now() - q.at < QUEUE_TTL ? q : null;
    }
    catch {
        return null;
    }
}
export const clearQueue = () => rmSync(queueFile(), { force: true });
/**
 * Marks the restart and ends the Claude Code process that spawned this server (the plugin runs `node` directly, so
 * it's the parent). `/T` takes this bridge down too; `belay claude`'s next claude starts a new one.
 */
export function endClaude(log) {
    mkdirSync(runDir(), { recursive: true });
    writeFileSync(restartFile(), "");
    const pid = process.ppid;
    if (process.platform !== "win32")
        return void process.kill(pid, "SIGTERM");
    execFile("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true }, (err) => {
        if (err)
            log(`restart: taskkill failed: ${err.message}`);
    });
}
