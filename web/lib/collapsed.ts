/**
 * The statuses whose task groups are collapsed, shared by every page. A cookie rather than browser
 * storage, so the server renders a collapsed group collapsed instead of it snapping shut on load.
 */
import type { TaskStatus } from './types';

export const COLLAPSED_COOKIE = 'tracker-collapsed';

// '.' rather than ',', which isn't a legal cookie value character.
export const parseCollapsed = (value: string | undefined) => new Set(value ? value.split('.') : []);

export function writeCollapsed(status: TaskStatus, collapsed: boolean) {
  const current = document.cookie.match(new RegExp(`(?:^|; )${COLLAPSED_COOKIE}=([^;]*)`))?.[1];
  const set = parseCollapsed(current);
  if (collapsed) set.add(status);
  else set.delete(status);
  document.cookie = `${COLLAPSED_COOKIE}=${[...set].join('.')}; path=/; max-age=31536000; samesite=lax`;
}
