export const SECTIONS = [
  { suffix: "", label: "Overview" },
  { suffix: "/syllabus", label: "Syllabus" },
  { suffix: "/map", label: "Map" },
  { suffix: "/lessons", label: "Lessons" },
  { suffix: "/notes", label: "Notes" },
  { suffix: "/misconceptions", label: "Misconceptions" },
  { suffix: "/cards", label: "Cards" },
  { suffix: "/work", label: "Work" },
] as const;

export type Section = (typeof SECTIONS)[number]["label"];

const BY_SEGMENT: Record<string, Section> = {
  syllabus: "Syllabus",
  map: "Map",
  lessons: "Lessons",
  notes: "Notes",
  misconceptions: "Misconceptions",
  cards: "Cards",
  work: "Work",
};

/**
 * Where a pathname sits inside a course: its slug, the section it lights
 * (null on /now) and whether it is a detail page nested under that section.
 * Null outside a course.
 */
export function sectionOf(
  pathname: string,
): { course: string; section: Section | null; detail: boolean } | null {
  const m = /^\/learn\/([^/]+)(?:\/([^/]+)(\/.+)?)?\/?$/.exec(pathname);
  if (!m) return null;
  const course = decodeURIComponent(m[1]);
  const [, , first, rest] = m;
  if (!first) return { course, section: "Overview", detail: false };
  if (first === "knowledge" || first === "sources") return { course, section: "Notes", detail: !!rest };
  if (first === "lessons" && rest) return { course, section: "Lessons", detail: true };
  if (first === "work") return { course, section: "Work", detail: false };
  const section = BY_SEGMENT[first];
  return { course, section: section && !rest ? section : null, detail: false };
}
