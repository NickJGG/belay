import fs from "node:fs";
import path from "node:path";
import { courseDir, visibleParts } from "./courses.ts";
import { isInputSidecar } from "./run.ts";

/*
 * The learner's `work/` folder: the only place the site writes. Every path is relative to the
 * course folder and must stay under `<course>/work/` after normalising and resolving links.
 */

const MAX_BYTES = 1_000_000;
// Generated folders nobody edits by hand; dot folders (.venv, .git) are hidden anyway.
const SKIP_DIRS = new Set(["__pycache__", "node_modules"]);

export type WorkEntry = { path: string; name: string; depth: number; dir: boolean };

/** `<course>/work`, whether or not it exists yet; null for an unknown course. */
function workRoot(course: string): string | null {
  const dir = courseDir(course);
  return dir ? path.join(dir, "work") : null;
}

/**
 * The absolute path for `rel` (e.g. `work/project/model.py`) when it is a file path under
 * work/, else null. The file need not exist, but its nearest existing ancestor must resolve
 * inside work/, so a link out of the folder is refused.
 */
export function workPath(course: string, rel: string): string | null {
  const base = workRoot(course);
  const parts = visibleParts(rel);
  if (!base || !parts || parts[0] !== "work" || parts.length < 2) return null;
  const abs = path.join(base, ...parts.slice(1));
  let probe = abs;
  while (!fs.existsSync(probe)) probe = path.dirname(probe);
  // Before work/ exists the walk stops at the course folder itself.
  if (probe === path.dirname(base)) return abs;
  const real = fs.realpathSync(probe);
  const realWork = path.join(fs.realpathSync(path.dirname(base)), "work");
  return real === realWork || real.startsWith(realWork + path.sep) ? abs : null;
}

/** work/ as a flat, depth-first list: folders before files, each sorted by name, without run input sidecars. */
export function listWork(course: string): WorkEntry[] {
  const base = workRoot(course);
  const out: WorkEntry[] = [];
  if (!base || !fs.existsSync(base)) return out;
  const walk = (dir: string, rel: string, depth: number) => {
    const all = fs.readdirSync(dir, { withFileTypes: true });
    const files = all.filter((e) => e.isFile()).map((e) => e.name);
    const entries = all
      .filter((e) => !e.name.startsWith(".") && (e.isFile() || (e.isDirectory() && !SKIP_DIRS.has(e.name))))
      .filter((e) => !e.isFile() || !isInputSidecar(e.name, files))
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name));
    for (const e of entries) {
      const p = `${rel}/${e.name}`;
      out.push({ path: p, name: e.name, depth, dir: e.isDirectory() });
      if (e.isDirectory()) walk(path.join(dir, e.name), p, depth + 1);
    }
  };
  walk(base, "work", 0);
  return out;
}

type WorkFile =
  | { kind: "text"; text: string; mtime: number; abs: string }
  | { kind: "binary" | "large"; abs: string };

export function readWork(course: string, rel: string): WorkFile | null {
  const abs = workPath(course, rel);
  if (!abs || !fs.existsSync(abs)) return null;
  const stat = fs.statSync(abs);
  if (!stat.isFile()) return null;
  if (stat.size > MAX_BYTES) return { kind: "large", abs };
  const buf = fs.readFileSync(abs);
  if (buf.includes(0)) return { kind: "binary", abs };
  return { kind: "text", text: buf.toString("utf8"), mtime: stat.mtimeMs, abs };
}

export type WriteResult =
  | { ok: true; mtime: number }
  | { ok: false; status: 400 | 404 | 409 | 413; error: string; text?: string; mtime?: number };

/**
 * Writes `text` to `rel`. `base` is the mtime the editor loaded; when the file changed on disk
 * since, nothing is written and the disk version comes back (409). `base: null` creates a new
 * file and fails if one exists; `force` skips the check.
 */
export function writeWork(
  course: string,
  rel: string,
  text: string,
  opts: { base: number | null; force?: boolean },
): WriteResult {
  const abs = workPath(course, rel);
  if (!abs) return { ok: false, status: 400, error: "Only files under work/ can be written." };
  if (Buffer.byteLength(text) > MAX_BYTES) return { ok: false, status: 413, error: "File too large." };
  const exists = fs.existsSync(abs);
  if (exists && !fs.statSync(abs).isFile()) return { ok: false, status: 400, error: "That's a folder." };
  if (!opts.force) {
    if (opts.base === null && exists) return { ok: false, status: 409, error: "A file with that name exists." };
    if (opts.base !== null) {
      if (!exists) return { ok: false, status: 404, error: "Deleted on disk." };
      const now = fs.statSync(abs).mtimeMs;
      if (now !== opts.base) {
        const current = fs.readFileSync(abs, "utf8");
        // A touch without a content change isn't a conflict.
        if (current !== text) return { ok: false, status: 409, error: "Changed on disk.", text: current, mtime: now };
      }
    }
  }
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  fs.writeFileSync(abs, text, "utf8");
  return { ok: true, mtime: fs.statSync(abs).mtimeMs };
}
