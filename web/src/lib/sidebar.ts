/** The sidebar's section rows: the open project's sections, or those of a place an extension owns, on a Reading page. */

import type { ExtensionId } from "../../../src/extension-ids.ts";
import { pseudoOwner, shellRules } from "./extensions.ts";
import { projectHref } from "./hrefs.ts";
import type { PageKind } from "./shell.ts";
import type { ProjectSection, SidebarRow } from "./slots.ts";

export type { SidebarRow };

const ISSUES: ProjectSection = { label: "Issues", suffix: "" };
const CORE_AFTER: ProjectSection[] = [
  { label: "Activity", suffix: "/activity" },
  { label: "Logs", suffix: "/logs" },
];

/** The pseudo-project `key` is, if its extension is active. */
export function pseudoProject(key: string, active: readonly ExtensionId[]): ExtensionId | undefined {
  const owner = pseudoOwner(key);
  return owner && active.includes(owner) ? owner : undefined;
}

/** A project's sections: Issues, the active extensions', Activity and Logs. A pseudo-project has only its own. */
export function sectionsOf(key: string, active: readonly ExtensionId[]): ProjectSection[] {
  const rules = shellRules(active);
  const pseudo = rules.find((r) => r.pseudo?.key === key);
  if (pseudo) return [...(pseudo.sections ?? [])];
  return [ISSUES, ...rules.flatMap((r) => r.sections ?? []), ...CORE_AFTER];
}

export type SidebarPlace = {
  kind: PageKind;
  project?: { key: string; name: string };
  /** A place an extension owns (a course), whose sections its rules list. */
  owner?: { id: ExtensionId; key: string; title: string };
  /** The section the page belongs to; a section page's own address decides without it. */
  section?: string;
};

/** The header and section rows under the app nav, or null in a Workspace or outside a project or owned place. */
export function sidebarSections(
  { kind, project, owner, section }: SidebarPlace,
  pathname: string,
  active: readonly ExtensionId[],
): { head: string; rows: SidebarRow[] } | null {
  if (kind === "workspace") return null;
  if (project) {
    return {
      head: project.name,
      rows: sectionsOf(project.key, active).map((s) => {
        const href = projectHref(project.key, s.suffix);
        return { label: s.label, href, on: section ? section === s.label : pathname === href };
      }),
    };
  }
  const place = owner && shellRules(active).find((r) => r.id === owner.id)?.place;
  if (owner && place) return { head: owner.title, rows: place(owner.key, pathname, section) };
  return null;
}
