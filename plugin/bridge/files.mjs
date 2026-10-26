/** The bridge's footprint on disk: `bridge.json` and `chat.jsonl` in a session folder (`<data>/grills/<slug>` or
 * `<data>/lessons/<slug>`), and Claude's transcripts. */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
export const dataDir = () => path.resolve(process.env.BELAY_DATA || path.join(os.homedir(), "Belay"));
export const grillsDir = () => path.join(dataDir(), "grills");
export const lessonsDir = () => path.join(dataDir(), "lessons");
export const runDir = () => path.join(dataDir(), ".run");
export const sessionDir = (slug, lesson = false) => path.join(lesson ? lessonsDir() : grillsDir(), slug);
export const learningRoot = () => process.env.LEARNING_ROOT || path.join(os.homedir(), "Learning");
/** Whether `dir` is the Learning root, where a queued lesson start may run. */
export const inLearningRoot = (dir) => path.relative(path.resolve(learningRoot()), path.resolve(dir)) === "";
/** The site's queued lesson start (`web/src/lib/start-queue.ts` writes it). */
export const queueFile = () => path.join(runDir(), "start.json");
/** While this exists when `claude` exits, `belay claude`'s loop starts it again (lesson.mts). */
export const restartFile = () => path.join(runDir(), "restart");
export function writeBridgeFile(dir, info) {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, "bridge.json"), JSON.stringify(info, null, 2) + "\n");
}
/** Only removes the file if this process wrote it: another session may have attached the slug since. */
export function removeBridgeFile(dir, pid = process.pid) {
    const file = path.join(dir, "bridge.json");
    try {
        if (JSON.parse(readFileSync(file, "utf8")).pid !== pid)
            return;
    }
    catch {
        return;
    }
    rmSync(file, { force: true });
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
export function appendChat(dir, entry) {
    mkdirSync(dir, { recursive: true });
    appendFileSync(path.join(dir, "chat.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
}
// --- Claude session discovery ------------------------------------------------
export const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");
// Claude Code names a cwd's log folder by replacing every non-alphanumeric character with "-".
export const logDirFor = (cwd) => path.join(PROJECTS_DIR, cwd.replace(/[^a-zA-Z0-9]/g, "-"));
/** Newest top-level `.jsonl` written at or after `since` across `dirs`. */
export function newestTranscript(dirs, since) {
    let best = null;
    for (const dir of dirs) {
        let names;
        try {
            names = readdirSync(dir);
        }
        catch {
            continue;
        }
        for (const name of names) {
            if (!name.endsWith(".jsonl"))
                continue;
            let mtime;
            try {
                mtime = statSync(path.join(dir, name)).mtimeMs;
            }
            catch {
                continue;
            }
            if (mtime >= since && (!best || mtime > best.mtime))
                best = { dir, id: name.slice(0, -6), mtime };
        }
    }
    return best;
}
// A plugin server's cwd isn't guaranteed to be the session's, so the cwd's log folder comes first and every
// project folder after.
function logDirs(cwd) {
    const near = [process.env.CLAUDE_PROJECT_DIR, cwd].filter((d) => !!d).map(logDirFor);
    const all = () => {
        try {
            return readdirSync(PROJECTS_DIR).map((d) => path.join(PROJECTS_DIR, d));
        }
        catch {
            return [];
        }
    };
    return [near, all];
}
/** Fallback when the session id is unknown: the transcript of the session calling `attach` was written moments ago. */
export function findSession(since, cwd = process.cwd()) {
    const [near, all] = logDirs(cwd);
    return newestTranscript(near, since) ?? newestTranscript(all(), since);
}
/** The log folder holding `<id>.jsonl`, if it exists yet. */
export function transcriptDir(id, cwd = process.cwd()) {
    const [near, all] = logDirs(cwd);
    for (const dir of [...near, ...all()])
        if (existsSync(path.join(dir, `${id}.jsonl`)))
            return dir;
    return null;
}
/**
 * The current session id of the Claude Code process that spawned this server, from the per-process
 * `~/.claude/sessions/<pid>.json` it keeps (undocumented; `/clear` rewrites its `sessionId`). Null if absent.
 */
export function ownerSessionId(pid = process.ppid) {
    try {
        const id = JSON.parse(readFileSync(path.join(os.homedir(), ".claude", "sessions", `${pid}.json`), "utf8")).sessionId;
        return typeof id === "string" && id ? id : null;
    }
    catch {
        return null;
    }
}
