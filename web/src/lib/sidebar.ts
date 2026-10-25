/** The sidebar's section rows: the open project's or course's sections on a Reading page. */

import { SECTIONS as COURSE_SECTIONS, sectionOf } from "./course-nav.ts";
import { courseHref, projectHref, UNFILED } from "./hrefs.ts";
import type { PageKind } from "./shell.ts";

/** A project's sections. Unfiled has only Grills. */
export const PROJECT_SECTIONS = [
  { label: "Issues", suffix: "" },
  { label: "Grills", suffix: "/grills" },
  { label: "Activity", suffix: "/activity" },
  { label: "Logs", suffix: "/logs" },
];

export const sectionsOf = (key: string) => (key === UNFILED ? PROJECT_SECTIONS.filter((s) => s.label === "Grills") : PROJECT_SECTIONS);

export type SidebarRow = { label: string; href: string; on: boolean };

export type SidebarPlace = {
  kind: PageKind;
  project?: { key: string; name: string };
  course?: { slug: string; title: string };
  /** The section the page belongs to; a section page's own address decides without it. */
  section?: string;
};

/** The header and section rows under the app nav, or null in a Workspace or outside a project or course. */
export function sidebarSections({ kind, project, course, section }: SidebarPlace, pathname: string): { head: string; rows: SidebarRow[] } | null {
  if (kind === "workspace") return null;
  if (project) {
    return {
      head: project.name,
      rows: sectionsOf(project.key).map((s) => {
        const href = projectHref(project.key, s.suffix);
        return { label: s.label, href, on: section ? section === s.label : pathname === href };
      }),
    };
  }
  if (course) {
    const lit = section ?? sectionOf(pathname)?.section;
    return {
      head: course.title,
      rows: COURSE_SECTIONS.map((s) => ({ label: s.label, href: courseHref(course.slug, s.suffix), on: lit === s.label })),
    };
  }
  return null;
}
