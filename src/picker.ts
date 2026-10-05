/** Option logic for the dashboard's issue picker. The browser bundles this file, so it imports nothing at runtime. */

export interface Pickable {
  id: string;
  title?: string;
}

/**
 * Candidates whose ID or title contains `query` (case-insensitive), minus `exclude`. Issues in
 * `preferProject` come first; otherwise the candidates' order is kept.
 */
export function pickerOptions<T extends Pickable>(candidates: T[], query: string, opts: { exclude?: readonly string[]; preferProject?: string } = {}): T[] {
  const q = query.trim().toLowerCase();
  const hits = candidates.filter(
    (c) => !opts.exclude?.includes(c.id) && (!q || c.id.toLowerCase().includes(q) || (c.title ?? '').toLowerCase().includes(q)),
  );
  const prefer = opts.preferProject?.toUpperCase();
  if (!prefer) return hits;
  const own = (c: T) => c.id.slice(0, c.id.lastIndexOf('-')) === prefer;
  return [...hits.filter(own), ...hits.filter((c) => !own(c))];
}

const LINK_ORDER = ['doing', 'todo', 'idea', 'done'];

/**
 * Issues a log entry in `project` may link to: doing, todo, idea, then done, each most recently
 * updated first. `current`, the entry's linked issue, is kept even if it would be left out.
 */
export function linkCandidates<T extends Pickable & { project: string; status: string; updated: string }>(issues: T[], project: string, current?: string): T[] {
  const rank = (t: T) => {
    const i = LINK_ORDER.indexOf(t.status);
    return i < 0 ? LINK_ORDER.length : i;
  };
  return issues
    .filter((t) => t.id === current || (t.project === project && t.status !== 'dropped'))
    .sort((a, b) => rank(a) - rank(b) || b.updated.localeCompare(a.updated));
}
