/** The bridge's footprint on disk: `bridge.json` and `chat.jsonl` in a session folder, and Claude's transcripts. */
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

export const sessionsDir = () => process.env.SEAR_SESSIONS_DIR ?? path.join(os.homedir(), "Sear", "sessions");
export const sessionDir = (slug: string) => path.join(sessionsDir(), slug);

export type BridgeFile = { port: number; token: string; sessionId: string | null; pid: number; at: string };

export function writeBridgeFile(slug: string, info: BridgeFile) {
  const dir = sessionDir(slug);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, "bridge.json"), JSON.stringify(info, null, 2) + "\n");
}

/** Only removes the file if this process wrote it: another session may have attached the slug since. */
export function removeBridgeFile(slug: string, pid = process.pid) {
  const file = path.join(sessionDir(slug), "bridge.json");
  try {
    if (JSON.parse(readFileSync(file, "utf8")).pid !== pid) return;
  } catch {
    return;
  }
  rmSync(file, { force: true });
}

export function appendChat(slug: string, entry: Record<string, unknown>) {
  const dir = sessionDir(slug);
  mkdirSync(dir, { recursive: true });
  appendFileSync(path.join(dir, "chat.jsonl"), JSON.stringify({ at: new Date().toISOString(), ...entry }) + "\n");
}

// --- Claude session discovery ------------------------------------------------

export const PROJECTS_DIR = path.join(os.homedir(), ".claude", "projects");
// Claude Code names a cwd's log folder by replacing every non-alphanumeric character with "-".
export const logDirFor = (cwd: string) => path.join(PROJECTS_DIR, cwd.replace(/[^a-zA-Z0-9]/g, "-"));

export type Transcript = { dir: string; id: string; mtime: number };

/** Newest top-level `.jsonl` written at or after `since` across `dirs`. */
export function newestTranscript(dirs: string[], since: number): Transcript | null {
  let best: Transcript | null = null;
  for (const dir of dirs) {
    let names: string[];
    try {
      names = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith(".jsonl")) continue;
      let mtime: number;
      try {
        mtime = statSync(path.join(dir, name)).mtimeMs;
      } catch {
        continue;
      }
      if (mtime >= since && (!best || mtime > best.mtime)) best = { dir, id: name.slice(0, -6), mtime };
    }
  }
  return best;
}

// A plugin server's cwd isn't guaranteed to be the session's, so the cwd's log folder comes first and every
// project folder after.
function logDirs(cwd: string): [string[], () => string[]] {
  const near = [process.env.CLAUDE_PROJECT_DIR, cwd].filter((d): d is string => !!d).map(logDirFor);
  const all = () => {
    try {
      return readdirSync(PROJECTS_DIR).map((d) => path.join(PROJECTS_DIR, d));
    } catch {
      return [];
    }
  };
  return [near, all];
}

/** Fallback when the session id is unknown: the transcript of the session calling `attach` was written moments ago. */
export function findSession(since: number, cwd = process.cwd()): Transcript | null {
  const [near, all] = logDirs(cwd);
  return newestTranscript(near, since) ?? newestTranscript(all(), since);
}

/** The log folder holding `<id>.jsonl`, if it exists yet. */
export function transcriptDir(id: string, cwd = process.cwd()): string | null {
  const [near, all] = logDirs(cwd);
  for (const dir of [...near, ...all()]) if (existsSync(path.join(dir, `${id}.jsonl`))) return dir;
  return null;
}

/**
 * The current session id of the Claude Code process that spawned this server, from the per-process
 * `~/.claude/sessions/<pid>.json` it keeps (undocumented; `/clear` rewrites its `sessionId`). Null if absent.
 */
export function ownerSessionId(pid = process.ppid): string | null {
  try {
    const id = JSON.parse(readFileSync(path.join(os.homedir(), ".claude", "sessions", `${pid}.json`), "utf8")).sessionId;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}
