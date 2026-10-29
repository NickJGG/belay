import path from "node:path";

/**
 * Everything the site may read in a course folder. Anything else is hidden, notably
 * exercises/ (worked solutions), rubrics/ (checkpoints are unseen), verification.md,
 * verify.md and .build/.
 */
const VISIBLE_FILES = new Set([
  "course.md",
  "syllabus.md",
  "map.md",
  "misconceptions.md",
  "now.md",
  "log.md",
  "cards.md",
  "corrections.md",
]);
const VISIBLE_DIRS = new Set(["knowledge", "sources", "lessons", "work"]);

/** The segments of `rel` (relative to a course folder) when it is visible, else null. No fs access. */
export function visibleParts(rel: string): string[] | null {
  const norm = path.posix.normalize(rel.replace(/\\/g, "/"));
  if (path.posix.isAbsolute(norm) || norm.startsWith("..")) return null;
  const parts = norm.split("/");
  if (parts.some((p) => p.startsWith(".") || p === "")) return null;
  const ok = VISIBLE_DIRS.has(parts[0]) || (parts.length === 1 && VISIBLE_FILES.has(parts[0]));
  return ok ? parts : null;
}
