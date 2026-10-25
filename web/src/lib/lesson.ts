/**
 * A live lesson's Follow along: the bridge's `show` events (bridge/lesson.mts) and the pages they point at. Imports
 * nothing that touches node, so client components can use it.
 */
import { courseHref } from "./hrefs.ts";
import { resolveWikiTarget } from "./wiki-target.ts";

export type LessonShow = {
  course: string;
  target: "claim" | "whiteboard" | "work" | "source";
  topic?: string;
  id?: string;
  path?: string;
};

/** Where a lesson's Tab lands (grill Q33). */
export const lessonHref = (course: string) => courseHref(course, "/now");

const SLUG = /^[a-z0-9][a-z0-9-]*$/;
const TARGETS = new Set(["claim", "whiteboard", "work", "source"]);
const str = (v: unknown) => (typeof v === "string" ? v : undefined);

/** A bridge event as a lesson's show, or null if it's a grill's (`{q, opt}`) or names no page. */
export function toShow(e: Record<string, unknown>): LessonShow | null {
  const course = str(e.course);
  if (e.type !== "show" || !course || !SLUG.test(course) || !TARGETS.has(e.target as string)) return null;
  const s: LessonShow = { course, target: e.target as LessonShow["target"] };
  for (const k of ["topic", "id", "path"] as const) if (str(e[k])) s[k] = str(e[k]);
  return showPage(s) ? s : null;
}

/** The page a show points at and how the Follow pill names it; null when its fields don't name one. */
export function showPage(s: LessonShow): { href: string; label: string } | null {
  switch (s.target) {
    case "claim":
      if (!s.topic || !SLUG.test(s.topic) || !s.id || !/^c\d+$/.test(s.id)) return null;
      return { href: resolveWikiTarget(s.course, `knowledge/${s.topic}#^${s.id}`), label: `${s.topic} · ${s.id}` };
    case "source":
      if (!s.id || !SLUG.test(s.id)) return null;
      return { href: resolveWikiTarget(s.course, `sources/${s.id}`), label: s.id };
    case "whiteboard":
      return { href: lessonHref(s.course), label: "the whiteboard" };
    case "work": {
      const parts = (s.path ?? "").replace(/\\/g, "/").replace(/^\.\//, "").split("/");
      if (parts[0] !== "work" || parts.length < 2 || parts.some((p) => !p || p === "." || p === "..")) return null;
      return { href: courseHref(s.course, `/work/${parts.slice(1).map(encodeURIComponent).join("/")}`), label: parts.join("/") };
    }
  }
}

/** A show's identity, so Follow along jumps once per new show and not again for a repeat of the last. */
export const showKey = (s: LessonShow) => [s.course, s.target, s.topic, s.id, s.path].join("|");

/** The course page a pathname is on, or null: a live lesson on that course is the page's Tab. */
export function coursePage(pathname: string): string | null {
  const m = /^\/courses\/([^/?#]+)/.exec(pathname);
  return m ? decodeURIComponent(m[1]) : null;
}
