/**
 * Lessons on the bridge, loaded on attach: the attempt and restart messages, the `show` targets a lesson may point
 * the site at, the lesson's session.json, and the start queue and restart.
 */
import { execFile } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { runDir } from "../../../bridge/files.mjs";
import { text } from "../../../bridge/kind.mjs";
import { Note, Slug } from "../../../bridge/protocol.mjs";
import { learningRoot, queueFile, restartFile } from "./learn.mjs";
const SLUG = /^[a-z0-9][a-z0-9-]*$/;
export const courseExists = (course) => SLUG.test(course) && existsSync(path.join(learningRoot(), course, "course.md"));
// Work handed in from the Work tab, and a start button asking for a fresh session.
export const Messages = [
    z.object({
        kind: z.literal("attempt"),
        slug: Slug,
        path: z.string().regex(/^work\/[^\0]{1,500}$/).refine((p) => !p.split("/").includes("..")),
        text: Note.optional(),
    }),
    z.object({ kind: z.literal("restart"), slug: Slug, label: z.string().trim().min(1).max(128), wrap: z.boolean().optional() }),
];
function format(m, head, meta) {
    switch (m.kind) {
        case "attempt":
            meta.path = m.path;
            return { content: `${head}: submitted \`${m.path}\` for you to read.${m.text ? `\n\n${m.text}` : ""}`, meta };
        case "restart":
            meta.wrap = String(!!m.wrap);
            return { content: `${head}: restart for ${m.label}.`, meta };
    }
}
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
/** A lesson's session.json (`kind: "lesson"`, see session-format.md): written at its first attach, closed at detach. */
export function writeLessonSession(dir, patch) {
    const file = path.join(dir, "session.json");
    let doc = {};
    try {
        doc = JSON.parse(readFileSync(file, "utf8"));
    }
    catch { }
    mkdirSync(dir, { recursive: true });
    writeFileSync(file, JSON.stringify({ ...doc, ...patch, kind: "lesson", updated: new Date().toISOString() }, null, 2) + "\n");
}
/** `lesson-<course>-<yyyymmdd>-<hhmm>`, local time, trimmed to the slug limit. */
function lessonSlug(course) {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
    return `lesson-${course.slice(0, 64 - 22).replace(/-+$/, "")}-${stamp}`;
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
export const runtime = {
    messages: Messages,
    exclusive: true,
    format: format,
    target({ course, topic }) {
        if (typeof course !== "string" || !courseExists(course))
            return `no course ${String(course)} in ${learningRoot()}`;
        const t = typeof topic === "string" && topic.trim() ? topic.trim().slice(0, 120) : undefined;
        return { course, ...(t ? { topic: t } : {}) };
    },
    same: (state, target) => state.course === target.course,
    slug: (target) => lessonSlug(target.course),
    opened(dir, s) {
        const now = new Date().toISOString();
        writeLessonSession(dir, { course: s.course, topic: s.topic ?? `Lesson · ${s.course}`, status: "in-progress", started: now });
    },
    reattached(dir, state, target) {
        if (!target.topic)
            return;
        state.topic = target.topic;
        writeLessonSession(dir, { topic: target.topic });
    },
    closed: (dir) => writeLessonSession(dir, { status: "done" }),
    head: (slug, s) => ({ head: `Belay site, lesson \`${slug}\` on ${s.course}`, meta: { course: s.course } }),
    snapshot: (s) => (s.focus ? [s.focus] : []),
    call(name, args, { state, broadcast, log }) {
        if (name === "show") {
            const parsed = Show.safeParse(args);
            if (!parsed.success)
                return text("expected {target, topic?, id?, path?}", true);
            const error = showError(state.course, parsed.data);
            if (error)
                return text(error, true);
            const e = { type: "show", course: state.course, ...parsed.data };
            state.focus = e;
            broadcast(e);
            return text("shown");
        }
        if (name === "restart") {
            if (!readQueue())
                return text("cancelled: the learner cancelled the start");
            // Leave time for Claude Code to record the tool result before the process dies.
            setTimeout(() => endClaude(log), 500);
            return text("restarting");
        }
        return undefined;
    },
};
