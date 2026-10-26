/**
 * Which paths under a watched root (session folders, belay's data, courses) the hub's watchers care about. chokidar
 * hands these functions forward-slash paths on Windows, so a path is only ever compared through `path.relative`,
 * never with `===`.
 */
import path from "node:path";
import { visibleParts } from "./course-paths.ts";
import { isSlug } from "./sessions.ts";

const isRoot = (root: string, p: string) => path.relative(root, p) === "";

/** `[slug, file]` for a file directly inside a session folder of `root`; `[slug, ""]` for the folder itself. */
export function locate(root: string, abs: string): [string, string] | null {
  const parts = path.relative(root, abs).split(path.sep);
  if (!parts[0] || !isSlug(parts[0]) || parts.length > 2) return null;
  return [parts[0], parts[1] ?? ""];
}

/** A sessions root (grills or lessons): every file of every session folder. */
export const sessionIgnored = (root: string) => (p: string) => !isRoot(root, p) && !locate(root, p);

const belayRel = (root: string, p: string) => path.relative(root, p).split(path.sep).join("/");

/** Whether a path under belay's data dir is something the pages show: an issue, a project, a day's log or order.yaml. */
export function belayWatched(root: string, abs: string): boolean {
  const rel = belayRel(root, abs);
  return rel === "order.yaml" || /^(issues|projects)\/[^/]+\.md$/.test(rel) || /^log\/[^/]+\.yaml$/.test(rel);
}

/** Belay's data dir: its watched files and the folders holding them. Temp files from `writeAtomic` are skipped. */
export const belayIgnored = (root: string) => (p: string) => {
  const rel = belayRel(root, p);
  return rel !== "" && rel !== "issues" && rel !== "projects" && rel !== "log" && !belayWatched(root, p);
};

/** `[course, rel]` for a path under the Learning root that the site may show, else null. */
export function courseLocate(root: string, abs: string): [string, string] | null {
  const parts = path.relative(root, abs).split(path.sep);
  if (parts.length < 2 || parts[0].startsWith(".") || parts[0] === "..") return null;
  const rel = parts.slice(1).join("/");
  return visibleParts(rel) ? [parts[0], rel] : null;
}

/** The Learning root: course folders and their visible paths (no exercises/, rubrics/ or dot folders). */
export const courseIgnored = (root: string) => (p: string) => {
  const rel = path.relative(root, p);
  if (!rel) return false;
  const parts = rel.split(path.sep);
  if (parts[0].startsWith(".") || parts[0] === "..") return true;
  return parts.length > 1 && !courseLocate(root, p);
};
