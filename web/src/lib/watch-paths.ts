/**
 * Which paths under a session root the hub's watchers care about. chokidar hands these functions
 * forward-slash paths on Windows, so a path is only ever compared through `path.relative`, never with `===`.
 */
import path from "node:path";
import { isSlug } from "./sessions.ts";

const isRoot = (root: string, p: string) => path.relative(root, p) === "";

/** `[slug, file]` for a file directly inside a session folder of `root`; `[slug, ""]` for the folder itself. */
export function locate(root: string, abs: string): [string, string] | null {
  const parts = path.relative(root, abs).split(path.sep);
  if (!parts[0] || !isSlug(parts[0]) || parts.length > 2) return null;
  return [parts[0], parts[1] ?? ""];
}

/** Sear root: every file of every session folder. */
export const searIgnored = (root: string) => (p: string) => !isRoot(root, p) && !locate(root, p);

/** Grill root: session folders and their `<slug>.md` only (they also hold large preview files). */
export const grillIgnored = (root: string) => (p: string, stats?: { isFile(): boolean }) => {
  if (isRoot(root, p)) return false;
  const hit = locate(root, p);
  return !hit || (!!stats?.isFile() && hit[1] !== `${hit[0]}.md`);
};
