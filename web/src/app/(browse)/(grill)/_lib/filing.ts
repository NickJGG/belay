/**
 * The fuzzy match that files grills under projects, ported from belay's src/extensions/grill/sessions.ts so the counts
 * agree with belay's digest.
 */
import type { Issue } from "../../../../lib/issues.ts";
import type { Project } from "../../../../lib/projects.ts";
import type { SessionBase } from "../../../../lib/sessions.ts";

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

/** Each session's project: the first, in project order, that files it. */
export function projectOf<S extends SessionBase>(sessions: S[], projects: Project[], byGrill: Map<string, Issue[]>): Map<string, Project> {
  const out = new Map<string, Project>();
  for (const { project, tagged, byIssues, matched } of fileSessions(sessions, projects, byGrill).projects) {
    for (const s of [...tagged, ...byIssues, ...matched]) if (!out.has(s.slug)) out.set(s.slug, project);
  }
  return out;
}
