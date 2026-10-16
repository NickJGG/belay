/** Read-only access to grill sessions (`<claudeDir>/skills/grill/sessions/<slug>/<slug>.md`) for search, the digest and the dashboard. */
import { closeSync, existsSync, openSync, readFileSync, readSync, readdirSync, statSync } from 'node:fs';
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

export function grillFile(claudeDir: string, slug: string): string {
  return join(grillDir(claudeDir), slug, `${slug}.md`);
}

/** The session's preview doc, which the grill skill keeps next to the session file. */
export function grillPreview(claudeDir: string, slug: string): string {
  return join(grillDir(claudeDir), slug, 'preview.html');
}

/** A session as its own page shows it: `body` is the markdown after the frontmatter. */
export type GrillDoc = GrillSession & { started?: string; body: string };

export const isGrillSlug = (s: string): boolean => /^[a-z0-9][a-z0-9-]*$/.test(s);

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n?---(?:\r?\n|$)/;
const PLAIN_LINE = /^([A-Za-z_]\w*): ([^-?:,[\]{}#&*!|>'"%@`\s](?:[^#]|\S#)*)$/;
const NON_STRING = /^(?:[-+.\d~]|0x|0o|(?:true|false|null)$)/i;

/**
 * YAML parsing dominates loading the session list, and nearly all grill frontmatter is flat `key: value` text.
 * Parses that shape alone; undefined for anything `yaml` might read differently, which then falls back to it.
 */
function plainFrontmatter(src: string): Record<string, string> | undefined {
  const data: Record<string, string> = {};
  for (const line of src.split(/\r?\n/)) {
    if (!line) continue;
    const m = PLAIN_LINE.exec(line);
    if (!m || m[1] in data) return undefined;
    const v = m[2].trimEnd();
    if (v.includes(': ') || v.endsWith(':') || (NON_STRING.test(v) && !/^\d{4}-\d\d-\d\d$/.test(v))) return undefined;
    data[m[1]] = v;
  }
  return data;
}

function readSession(text: string, slug: string): GrillDoc {
  let data: Record<string, unknown> = {};
  let body = text;
  const m = FRONTMATTER.exec(text);
  const plain = m && plainFrontmatter(m[1]);
  if (plain) {
    data = plain;
    body = text.slice(m[0].length).trim();
  } else {
    try {
      ({ data, body } = splitFrontmatter(text, `${slug}.md`));
    } catch {
      // a malformed session is still findable by slug
    }
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

const CHUNK = 4096;

/** The file up to the end of its frontmatter, or the whole file when it has no closed frontmatter block. */
function readHead(path: string): string {
  const fd = openSync(path, 'r');
  try {
    let buf = Buffer.alloc(0);
    for (;;) {
      const chunk = Buffer.alloc(CHUNK);
      const n = readSync(fd, chunk, 0, CHUNK, null);
      if (n === 0) return buf.toString('utf8');
      buf = Buffer.concat([buf, chunk.subarray(0, n)]);
      // latin1 maps bytes 1:1, so the match length is a byte offset; a match ending at `$` might continue in the next chunk
      const m = FRONTMATTER.exec(buf.toString('latin1'));
      if (m?.[0].endsWith('\n')) return buf.toString('utf8', 0, m[0].length);
    }
  } finally {
    closeSync(fd);
  }
}

function readSummary(path: string, slug: string): GrillSession {
  const { topic, status, updated, project } = readSession(readHead(path), slug);
  return { slug, topic, status, updated, project };
}

/** Parsed sessions keyed by slug, reused while the session file's mtime is unchanged. */
export type GrillMemo = Map<string, { mtimeMs: number; session: GrillSession }>;

/** Slugs of the session folders: a slug-named directory holding `<slug>.md`. Anything else in the dir is skipped. */
function sessionSlugs(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && isGrillSlug(e.name) && existsSync(join(dir, e.name, `${e.name}.md`)))
    .map((e) => e.name);
}

export function loadGrillSessions(claudeDir: string, memo?: GrillMemo): GrillSession[] {
  const slugs = sessionSlugs(grillDir(claudeDir));
  if (!memo) return slugs.map((slug) => readSummary(grillFile(claudeDir, slug), slug));
  const present = new Set(slugs);
  for (const slug of memo.keys()) if (!present.has(slug)) memo.delete(slug);
  return slugs.map((slug) => {
    const path = grillFile(claudeDir, slug);
    const { mtimeMs } = statSync(path);
    const hit = memo.get(slug);
    if (hit?.mtimeMs === mtimeMs) return hit.session;
    const session = readSummary(path, slug);
    memo.set(slug, { mtimeMs, session });
    return session;
  });
}

/** One session with its markdown body, minus the `# Grill session: …` heading. Undefined for a missing file or a slug that isn't a plain file name. */
export function loadGrillSession(claudeDir: string, slug: string): GrillDoc | undefined {
  if (!isGrillSlug(slug)) return undefined;
  const path = grillFile(claudeDir, slug);
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
