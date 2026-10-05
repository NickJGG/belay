/**
 * The dashboard's keyboard layer, kept free of the DOM so it can be tested here. The browser bundles
 * this file, so it takes only types from the store, whose runtime pulls in node:fs.
 */
import type { IssueStatus } from './store.ts';

/** `ISSUE_STATUSES` order, which is the 1–5 order. */
export const STATUS_KEYS: readonly IssueStatus[] = ['idea', 'todo', 'doing', 'done', 'dropped'];

export type KeyCommand =
  | { kind: 'palette' }
  | { kind: 'create' }
  | { kind: 'move'; delta: 1 | -1 }
  | { kind: 'status'; status: IssueStatus }
  | { kind: 'edit' }
  | { kind: 'open' }
  | { kind: 'help' }
  | { kind: 'clear' };

export interface KeyPress {
  key: string;
  ctrl: boolean;
  meta: boolean;
  alt: boolean;
  /** `text`: an input, textarea, select or contenteditable. `control`: a link, button or summary, which Enter already activates. */
  focus: 'text' | 'control' | 'none';
}

export function keyCommand(e: KeyPress): KeyCommand | undefined {
  if ((e.ctrl || e.meta) && !e.alt && e.key.toLowerCase() === 'k') return { kind: 'palette' };
  if (e.focus === 'text' || e.ctrl || e.meta || e.alt) return undefined;
  const n = Number(e.key);
  if (Number.isInteger(n) && n >= 1 && n <= STATUS_KEYS.length) return { kind: 'status', status: STATUS_KEYS[n - 1] };
  switch (e.key) {
    case 'c':
      return { kind: 'create' };
    case 'j':
      return { kind: 'move', delta: 1 };
    case 'k':
      return { kind: 'move', delta: -1 };
    case 'e':
      return { kind: 'edit' };
    case 'Enter':
      return e.focus === 'control' ? undefined : { kind: 'open' };
    case '/':
      return { kind: 'palette' };
    case '?':
      return { kind: 'help' };
    case 'Escape':
      return { kind: 'clear' };
  }
  return undefined;
}

/** From nothing selected, `j` starts at the top and `k` at the bottom; both stop at the ends. */
export function step(ids: string[], current: string | undefined, delta: 1 | -1): string | undefined {
  if (!ids.length) return undefined;
  const i = current === undefined ? -1 : ids.indexOf(current);
  if (i === -1) return delta === 1 ? ids[0] : ids[ids.length - 1];
  return ids[Math.min(ids.length - 1, Math.max(0, i + delta))];
}

const segment = (pathname: string, prefix: string): string | undefined => {
  if (!pathname.startsWith(prefix)) return undefined;
  const rest = pathname.slice(prefix.length);
  return rest && !rest.includes('/') ? decodeURIComponent(rest) : undefined;
};

/** The issue a page is about, which keys act on when nothing is selected. */
export const pageIssue = (pathname: string): string | undefined => segment(pathname, '/i/');

/** The project a page belongs to, which a new issue defaults to. */
export function pageProject(pathname: string): string | undefined {
  const issue = pageIssue(pathname);
  return issue ? /^(.+)-\d+$/.exec(issue)?.[1] : segment(pathname, '/p/');
}
