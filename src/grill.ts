/** Read-only access to grill sessions (`<claudeDir>/skills/grill/sessions/<slug>.md`) for search, the digest and the dashboard. */
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { splitFrontmatter, type Project } from './store.ts';

export interface GrillSession {
  slug: string;
  topic: string;
  status?: string;
  updated?: string;
  /** Project key the grill skill tagged the session with; older sessions have none. */
  project?: string;
}

export function grillDir(claudeDir: string): string {
  return join(claudeDir, 'skills', 'grill', 'sessions');
}

/** A session as its own page shows it: `body` is the markdown after the frontmatter. */
export type GrillDoc = GrillSession & { started?: string; body: string };

export const isGrillSlug = (s: string): boolean => /^[a-z0-9][a-z0-9-]*$/.test(s);

function readSession(text: string, slug: string): GrillDoc {
  let data: Record<string, unknown> = {};
  let body = text;
  try {
    ({ data, body } = splitFrontmatter(text, `${slug}.md`));
  } catch {
    // a malformed session is still findable by slug
  }
  const str = (k: string) => (data[k] == null ? undefined : String(data[k]));
  return {
    slug,
    topic: str('topic') ?? '',
    status: str('status'),
    started: str('started'),
    updated: str('updated') ?? str('started'),
    project: str('project'),
    body,
  };
}

export function loadGrillSessions(claudeDir: string): GrillSession[] {
  const dir = grillDir(claudeDir);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.md'))
    .map((f) => {
      const { slug, topic, status, updated, project } = readSession(readFileSync(join(dir, f), 'utf8'), f.slice(0, -3));
      return { slug, topic, status, updated, project };
    });
}

/** One session with its markdown body, minus the `# Grill session: …` heading. Undefined for a missing file or a slug that isn't a plain file name. */
export function loadGrillSession(claudeDir: string, slug: string): GrillDoc | undefined {
  if (!isGrillSlug(slug)) return undefined;
  const path = join(grillDir(claudeDir), `${slug}.md`);
  if (!existsSync(path)) return undefined;
  const s = readSession(readFileSync(path, 'utf8'), slug);
  return { ...s, body: s.body.replace(/^#\s+Grill session:[^\n]*\n*/, '') };
}

/** Sessions tagged with the project, plus untagged ones whose slug or topic mentions one of its terms. */
export function grillForProject(grill: GrillSession[], project: Project): { tagged: GrillSession[]; matched: GrillSession[] } {
  const terms = projectTerms(project);
  return {
    tagged: grill.filter((g) => g.project?.toUpperCase() === project.key),
    matched: grill.filter((g) => !g.project && terms.some((t) => grillMentions(g, t))),
  };
}

/** Words of 5+ letters from a project's key and name, singularized, for fuzzy-matching untagged grill sessions. */
export function projectTerms(p: Project): string[] {
  const words = `${p.key} ${p.name}`.toLowerCase().split(/[^a-z0-9]+/);
  return [...new Set(words.filter((w) => w.length >= 5).map((w) => w.replace(/s$/, '')))];
}

/** True when the slug or topic has a word starting with `term`. */
export function grillMentions(g: GrillSession, term: string): boolean {
  return new RegExp(`(^|[^a-z0-9])${term}`).test(`${g.slug} ${g.topic}`.toLowerCase());
}

/** True when every word of the query appears in the slug, topic or project tag. */
export function grillMatches(g: GrillSession, words: string[]): boolean {
  const hay = `${g.slug} ${g.topic} ${g.project ?? ''}`.toLowerCase();
  return words.every((w) => hay.includes(w.toLowerCase()));
}
