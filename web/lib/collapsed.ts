/**
 * The issue groups toggled away from their default open state, shared by every page. A cookie rather
 * than browser storage, so the server renders a collapsed group collapsed instead of it snapping shut on load.
 * Status groups default open, so for them this is the set of collapsed statuses.
 */
export const COLLAPSED_COOKIE = 'tracker-collapsed';

// '.' rather than ',', which isn't a legal cookie value character.
export const parseCollapsed = (value: string | undefined) => new Set(value ? value.split('.') : []);

export function writeCollapsed(id: string, toggled: boolean) {
  const current = document.cookie.match(new RegExp(`(?:^|; )${COLLAPSED_COOKIE}=([^;]*)`))?.[1];
  const set = parseCollapsed(current);
  if (toggled) set.add(id);
  else set.delete(id);
  document.cookie = `${COLLAPSED_COOKIE}=${[...set].join('.')}; path=/; max-age=31536000; samesite=lax`;
}
