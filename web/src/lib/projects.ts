/**
 * Belay projects, as belay's store loads them, and the fuzzy match that files untagged sessions under them,
 * ported from belay's src/grill.ts so the counts agree with belay's digest.
 */
import { existsSync } from "node:fs";
import { extname, isAbsolute, join, resolve } from "node:path";
import type { Ctx } from "../../../src/ops.ts";
import { COLOR_RE } from "../../../src/store.ts";
import type { Issue } from "./issues.ts";
import type { SessionBase } from "./sessions.ts";

export type Project = {
  key: string;
  name: string;
  status: string;
  focus: boolean;
  group?: string;
  /** Absolute path to the project's icon file, when it has one. */
  icon?: string;
  /** belay's `color:`, when it's a valid hex colour. */
  color?: string;
};

/** Where a repo's own favicon usually lives, in the order they're tried. */
const ICON_CANDIDATES = [
  "src/app/icon.svg",
  "app/icon.svg",
  "public/favicon.svg",
  "public/icon.svg",
  "favicon.ico",
  "public/favicon.ico",
  "icon.png",
];

export const ICON_TYPES: Record<string, string> = {
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".ico": "image/x-icon",
};

/** belay's `icon:` (absolute, or relative to the first path), else the first favicon found in the repo. */
export function resolveIcon(field: string | undefined, root: string | undefined): string | undefined {
  const usable = (f: string) => extname(f).toLowerCase() in ICON_TYPES && existsSync(f);
  if (field) {
    if (isAbsolute(field)) return usable(field) ? field : undefined;
    return root && usable(resolve(root, field)) ? resolve(root, field) : undefined;
  }
  if (!root) return undefined;
  return ICON_CANDIDATES.map((c) => join(root, c)).find(usable);
}

/** Projects in `belay project list` order: focused first, then ungrouped before groups, then the manual order. */
export function projectsOf(ctx: Pick<Ctx, "projects">): Project[] {
  const projects = ctx.projects.map((p) => ({
    key: p.key,
    name: p.name,
    status: p.status,
    focus: p.focus,
    group: p.group,
    icon: resolveIcon(p.icon, p.paths[0]),
    color: p.color && COLOR_RE.test(p.color) ? p.color : undefined,
  }));
  // ctx.projects is already in order.yaml order, and the sort is stable.
  return projects.sort((a, b) => Number(b.focus) - Number(a.focus) || (a.group ?? "").localeCompare(b.group ?? ""));
}

/** Words of 5+ letters from a project's key and name, singularized, for fuzzy-matching untagged sessions. */
export function projectTerms(p: Project): string[] {
  const words = `${p.key} ${p.name}`.toLowerCase().split(/[^a-z0-9]+/);
  return [...new Set(words.filter((w) => w.length >= 5).map((w) => w.replace(/s$/, "")))];
}

/** True when the slug or topic has a word starting with `term`. */
function sessionMentions(s: SessionBase, term: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${term}`).test(`${s.slug} ${s.topic}`.toLowerCase());
}

export type ProjectSessions<S extends SessionBase = SessionBase> = {
  project: Project;
  tagged: S[];
  /** Untagged, filed by the projects of its belay issues. */
  byIssues: S[];
  matched: S[];
};

/**
 * Sessions per project, first rule that files it wins: tagged with its key; else untagged with belay issues in
 * known projects (filed under each of them); else mentioning one of its terms (a session can match several).
 * Unfiled: the sessions none of these place, and those tagged with a key belay doesn't know.
 */
export function fileSessions<S extends SessionBase>(
  sessions: S[],
  projects: Project[],
  byGrill: Map<string, Issue[]> = new Map(),
): { projects: ProjectSessions<S>[]; unfiled: S[] } {
  const known = new Set(projects.map((p) => p.key));
  const issueProjects = new Map<string, Set<string>>();
  for (const s of sessions) {
    if (s.project) continue;
    const keys = new Set((byGrill.get(s.slug) ?? []).map((i) => i.project).filter((k) => known.has(k)));
    if (keys.size) issueProjects.set(s.slug, keys);
  }
  const filed = new Set<string>();
  const out = projects.map((project) => {
    const terms = projectTerms(project);
    const tagged = sessions.filter((s) => s.project === project.key);
    const byIssues = sessions.filter((s) => issueProjects.get(s.slug)?.has(project.key));
    const matched = sessions.filter(
      (s) => !s.project && !issueProjects.has(s.slug) && terms.some((t) => sessionMentions(s, t)),
    );
    for (const s of [...tagged, ...byIssues, ...matched]) filed.add(s.slug);
    return { project, tagged, byIssues, matched };
  });
  return { projects: out, unfiled: sessions.filter((s) => !filed.has(s.slug)) };
}
