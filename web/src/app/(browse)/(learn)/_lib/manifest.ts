import { PATH_PATTERNS } from "../../../../../../src/extension-ids.ts";
import { SECTIONS, sectionOf } from "../../../../lib/course-nav.ts";
import { courseHref } from "../../../../lib/hrefs.ts";
import { toShow, type LessonShow } from "../../../../lib/lesson.ts";
import type { PureKind } from "../../../../lib/session-kind.ts";
import type { Missing, ShellRules } from "../../../../lib/slots.ts";

const session: PureKind<LessonShow> = {
  tools: {},
  focus: toShow,
  // Today's wording, which names /grill for a lesson too.
  reattach: (slug) => `Not attached: run \`/grill resume ${slug}\` in the terminal`,
};

const COURSE_TABS = new Set(["map", "lessons", "notes", "misconceptions", "cards", "work", "now"]);

function missing(pathname: string): Missing | null {
  const course = /^\/learn\/([^/?#]+)(?:\/([^/?#]+)(?:\/([^?#]+?))?)?\/?$/.exec(pathname);
  if (!course) return null;
  const [c, kind, rest] = course.slice(1).map((p) => p && decodeURIComponent(p));
  const base = `/learn/${encodeURIComponent(c)}`;
  // A tab 404s only when its course is missing.
  if (!kind || (!rest && COURSE_TABS.has(kind))) return { what: `No course ${c}.`, back: { href: "/learn", label: "Back to Learn" } };
  const notes = { href: `${base}/notes`, label: "Back to Notes" };
  if (kind === "knowledge") return { what: `No note ${rest}.`, back: notes };
  if (kind === "sources") return { what: `No source ${rest}.`, back: notes };
  if (kind === "lessons") return { what: `No lesson ${rest}.`, back: { href: `${base}/lessons`, label: "Back to Lessons" } };
  if (kind === "work") return { what: `No file work/${rest}.`, back: { href: `${base}/work`, label: "Back to Work" } };
  return { what: `No page at ${pathname}.`, back: { href: base, label: "Back to the course" } };
}

/** A lesson's Now page and a course's Work tab are Workspaces; any page of a course belongs to its live lesson's Tab. */
const shell: ShellRules = {
  workspace: (p) => /^\/learn\/[^/]+\/(work(\/|$)|now\/?$)/.test(p),
  tab: (p, live) => {
    const course = /^\/learn\/([^/?#]+)/.exec(p)?.[1];
    if (!course) return null;
    return live.find((l) => l.course === decodeURIComponent(course))?.slug ?? null;
  },
  missing,
  place: (course, pathname, section) => {
    const lit = section ?? sectionOf(pathname)?.section;
    return SECTIONS.map((s) => ({ label: s.label, href: courseHref(course, s.suffix), on: lit === s.label }));
  },
};

export const manifest = { id: "learn", noun: "courses", patterns: PATH_PATTERNS.learn, session, shell } as const;
