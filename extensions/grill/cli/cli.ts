/** Grill's CLI slots: `belay grill commit`, its `belay search` hits and its digest line. */
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { args, print } from '../../../src/argv.ts';
import { dataDir, sessionsDir } from '../../../src/config.ts';
import { clip, plural } from '../../../src/digest.ts';
import { owned } from '../../../src/extensions.ts';
import { commitPathsOrThrow, hasChanges, hasHistory } from '../../../src/gitlog.ts';
import { grillForProject, grillMatches, grillStatus, isGrillSlug, loadGrillSessions, projectTerms, type GrillSession } from './sessions.ts';
import { commentAuthor } from '../../../src/ops.ts';
import { normalizeStoredPath, type Issue, type Project } from '../../../src/store.ts';

/**
 * Commits a finished grill's folder, `grill <slug> - <by>`. Only a `planned` grill: one still in progress or
 * abandoned stays out of history. Checks the grill even when the data dir has no history, then does nothing.
 */
export function commitGrill(dir: string, slug: string, author: { by: string; session?: string }): 'committed' | 'unchanged' | 'no history' {
  if (!isGrillSlug(slug)) throw new Error(`'${slug}' is not a grill slug`);
  const folder = join(sessionsDir('grill', dir), slug);
  if (!existsSync(folder)) throw new Error(`no grill '${slug}' in ${sessionsDir('grill', dir)}`);
  const status = grillStatus(sessionsDir('grill', dir), slug);
  if (status !== 'planned') throw new Error(`grill '${slug}' is ${status ?? 'without a status'}; only a planned grill is committed`);
  if (!hasHistory(dir)) return 'no history';
  // A bridge's token stays out even in a data dir whose .gitignore predates grills/. The wildcard matters: git refuses
  // a pathspec that literally names an ignored file, exclude or not.
  const paths = [folder, `:(exclude)grills/${slug}/bridge.*`];
  if (!hasChanges(dir, paths)) return 'unchanged';
  commitPathsOrThrow(dir, paths, `grill ${slug} - ${author.by}`, author.session && `Session: ${author.session}`);
  return 'committed';
}

export function cmdGrill(argv: string[]): void {
  const [sub, ...rest] = argv;
  if (sub !== 'commit') throw new Error(`unknown 'grill ${sub ?? ''}' — expected commit`);
  const slug = args(rest, {}, 1).positionals[0];
  const result = commitGrill(dataDir(), slug, commentAuthor(process.env));
  print(result === 'committed' ? `committed grill ${slug}` : result === 'unchanged' ? 'nothing to commit' : 'no git history: nothing committed');
}

export function searchLines(words: string[], data: string): string[] {
  const dir = sessionsDir('grill', data);
  const grill = loadGrillSessions(dir)
    .filter((g) => grillMatches(g, words))
    .sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''));
  if (!grill.length) return [];
  const out = [`grill sessions (<slug>/<slug>.md in ${normalizeStoredPath(dir)})`];
  const slugW = Math.max(...grill.map((g) => g.slug.length));
  const statusW = Math.max(...grill.map((g) => (g.status ?? '').length));
  const projW = Math.max(...grill.map((g) => (g.project ?? '').length));
  for (const g of grill) {
    const proj = projW ? `${(g.project ?? '-').padEnd(projW)}  ` : '';
    out.push(`  ${g.slug.padEnd(slugW)}  ${(g.status ?? '').padEnd(statusW)}  ${g.updated ?? '          '}  ${proj}${clip(g.topic, 100)}`);
  }
  return out;
}

export function digestSection(project: Project, issues: Issue[], data: string): string[] {
  return digestLines(project, issues, loadGrillSessions(sessionsDir('grill', data)));
}

/** The project's grill sessions that no issue links to yet, as one line, or none. */
export function digestLines(project: Project, issues: Issue[], grill: GrillSession[]): string[] {
  const linked = new Set(issues.map((t) => owned(t, 'grill').grill));
  const { tagged, matched } = grillForProject(grill.filter((g) => !linked.has(g.slug)), project);
  const parts: string[] = [];
  if (tagged.length) {
    const open = tagged.filter((g) => g.status === 'in-progress').sort((a, b) => (b.updated ?? '').localeCompare(a.updated ?? ''));
    const slugs = open.slice(0, 2).map((g) => g.slug).join(', ') + (open.length > 2 ? ', …' : '');
    parts.push(`${plural(tagged.length, 'session')} tagged${open.length ? ` (in progress: ${slugs})` : ''}`);
  }
  if (matched.length) {
    parts.push(`${plural(matched.length, 'old session')} ${matched.length === 1 ? 'matches' : 'match'} ${projectTerms(project).join('/')}`);
  }
  return parts.length ? [`grill: ${parts.join(' · ')} (belay search <word>)`] : [];
}
