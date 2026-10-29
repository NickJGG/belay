/** Which paths under the Learning root learn's course watcher cares about, compared through `path.relative` as the hub's are. */
import path from "node:path";
import { visibleParts } from "./course-paths.ts";

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
