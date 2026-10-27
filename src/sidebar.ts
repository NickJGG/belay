/**
 * The dashboard sidebar's project sections, and how dropping a dragged project turns into a write.
 * Pure (no fs), so client components can import it.
 */
import type { Project } from './store.ts';

export type MoveTarget = { before: string } | { after: string } | 'top' | 'bottom';

export type SidebarProject = Pick<Project, 'key' | 'name' | 'status' | 'focus' | 'group'>;

/** `focus`, or `group:<name>` (`group:` is the ungrouped "Projects" section). */
export type SectionId = 'focus' | `group:${string}`;

export interface Section<P extends SidebarProject = SidebarProject> {
  id: SectionId;
  kind: 'focus' | 'group';
  /** Empty for the ungrouped section. */
  group?: string;
  projects: P[];
}

/** The subset of `ProjectPatch` a drop can produce. */
export interface DropPatch {
  focus?: boolean;
  /** Empty clears. */
  group?: string;
}

export type DropPlan = { patch?: DropPatch; move: MoveTarget } | { error: string } | null;

const inFocus = (p: SidebarProject) => p.status === 'active' && p.focus;

/** Moves `key` within `keys`. Throws on an unknown anchor or one equal to `key`. */
export function reorder(keys: string[], key: string, where: MoveTarget): string[] {
  const rest = keys.filter((k) => k !== key);
  let at: number;
  if (where === 'top') at = 0;
  else if (where === 'bottom') at = rest.length;
  else {
    const anchor = 'before' in where ? where.before : where.after;
    if (anchor === key) throw new Error(`cannot move ${key} relative to itself`);
    const i = rest.indexOf(anchor);
    if (i < 0) throw new Error(`no project '${anchor}'`);
    at = i + ('after' in where ? 1 : 0);
  }
  rest.splice(at, 0, key);
  return rest;
}

/** Focus first, then named groups alphabetically, then ungrouped. Each keeps the order of `projects`. */
export function sidebarSections<P extends SidebarProject>(projects: P[]): Section<P>[] {
  const sections: Section<P>[] = [];
  const focus = projects.filter(inFocus);
  if (focus.length) sections.push({ id: 'focus', kind: 'focus', projects: focus });
  const rest = projects.filter((p) => p.status !== 'archived' && !inFocus(p));
  const groups = [...new Set(rest.map((p) => p.group ?? ''))].sort((a, b) => (a ? (b ? a.localeCompare(b) : -1) : 1));
  for (const g of groups) sections.push({ id: `group:${g}`, kind: 'group', group: g, projects: rest.filter((p) => (p.group ?? '') === g) });
  return sections;
}

function sectionOf(sections: Section[], key: string): Section | undefined {
  return sections.find((s) => s.projects.some((p) => p.key === key));
}

/**
 * What dropping `dragged` into `target` before `beforeKey` (null: at the end) means. `target` may
 * name a section that doesn't exist yet. Returns null when nothing would change.
 */
export function dropPlan(sections: Section[], dragged: string, target: SectionId, beforeKey: string | null): DropPlan {
  const from = sectionOf(sections, dragged);
  const project = from?.projects.find((p) => p.key === dragged);
  if (!from || !project) return { error: `${dragged} isn't in the sidebar` };

  let patch: DropPatch | undefined;
  if (target === 'focus') {
    if (project.status === 'paused') return { error: `${dragged} is paused; resume it before focusing it` };
    if (from.id !== 'focus') patch = { focus: true };
  } else {
    const group = target.slice('group:'.length);
    if (from.id === 'focus') patch = { focus: false, group };
    else if (from.id !== target) patch = { group };
  }

  const keys = (sections.find((s) => s.id === target)?.projects ?? []).map((p) => p.key);
  const others = keys.filter((k) => k !== dragged);
  // Dropping a row onto its own top half lands it where it already is.
  const at = beforeKey === null ? others.length : beforeKey === dragged ? keys.indexOf(dragged) : others.indexOf(beforeKey);
  if (at < 0) return { error: `${beforeKey} isn't in that section` };
  if (!patch && reorder(others, dragged, at < others.length ? { before: others[at] } : 'bottom').join() === keys.join()) return null;

  const move: MoveTarget = at < others.length ? { before: others[at] } : others.length ? { after: others.at(-1)! } : 'bottom';
  return { patch, move };
}

/** The projects as they'll be once a drop's patch and move are saved, for an optimistic update. */
export function applyDrop<P extends SidebarProject>(projects: P[], key: string, patch: DropPatch | undefined, move: MoveTarget): P[] {
  const patched = projects.map((p) =>
    p.key !== key || !patch
      ? p
      : {
          ...p,
          ...(patch.focus !== undefined && { focus: patch.focus }),
          ...(patch.group !== undefined && { group: patch.group.trim() || undefined }),
        },
  );
  const byKey = new Map(patched.map((p) => [p.key, p]));
  return reorder(
    patched.map((p) => p.key),
    key,
    move,
  ).map((k) => byKey.get(k)!);
}

/** The neighbours `key` can swap with inside its section, for the palette's move up/down. */
export function sectionNeighbours(sections: Section[], key: string): { prev?: string; next?: string } {
  const keys = sectionOf(sections, key)?.projects.map((p) => p.key) ?? [];
  const i = keys.indexOf(key);
  if (i < 0) return {};
  return { prev: keys[i - 1], next: keys[i + 1] };
}
