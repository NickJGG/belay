/**
 * The dashboard's create dialog, kept free of the DOM so it can be tested here. One draft serves all
 * three types: switching keeps every field, and only the fields of the current type are submitted.
 */

/** Switcher order. Todo and idea create an issue with that status; log creates a log entry. */
export const CREATE_TYPES = ['todo', 'idea', 'log'] as const;

export type CreateType = (typeof CREATE_TYPES)[number];

export interface CreateDraft {
  type: CreateType;
  /** The issue's title or the log entry's text. */
  text: string;
  project: string;
  high: boolean;
  blockers: string[];
  body: string;
  kind: string;
  count: string;
  /** `today`, `yesterday` or `YYYY-MM-DD`. */
  day: string;
}

export const EMPTY_CREATE: CreateDraft = { type: 'todo', text: '', project: '', high: false, blockers: [], body: '', kind: '', count: '', day: 'today' };

/** Nothing typed or chosen yet. Kind and project don't count: they're remembered defaults. */
export const isBlankCreate = (d: CreateDraft): boolean => !d.text && !d.body && !d.blockers.length && !d.high && !d.count && d.day === 'today';

export function cycleType(t: CreateType, delta: 1 | -1): CreateType {
  const n = CREATE_TYPES.length;
  return CREATE_TYPES[(CREATE_TYPES.indexOf(t) + delta + n) % n];
}

export interface OpenContext {
  type: CreateType;
  pageProject: string | undefined;
  lastProject: string | undefined;
  lastKind: string | undefined;
  /** Unarchived projects. */
  openProjects: readonly { key: string; kinds?: string[] }[];
}

/** The draft as the dialog should open on it. An unsaved draft wins over the requested type and defaults. */
export function openDraft(d: CreateDraft, { type, pageProject, lastProject, lastKind, openProjects }: OpenContext): CreateDraft {
  if (!isBlankCreate(d)) return d;
  const project = openProjects.find((p) => p.key === pageProject) ?? openProjects.find((p) => p.key === lastProject);
  const kind = lastKind && project?.key === lastProject && project?.kinds?.includes(lastKind) ? lastKind : '';
  return { ...d, type, project: project?.key ?? '', kind };
}

/** Ctrl+] and Ctrl+[ step through the types. Literal Ctrl everywhere, since Cmd+[ is a Mac browser's Back. */
export function switchKeyDelta(e: { code: string; ctrl: boolean; meta: boolean; alt: boolean }): 1 | -1 | undefined {
  if (!e.ctrl || e.meta || e.alt) return undefined;
  if (e.code === 'BracketRight') return 1;
  if (e.code === 'BracketLeft') return -1;
  return undefined;
}
