/**
 * The built-in extensions' ids, defaults and URL patterns. Imports nothing, so the proxy, the manifests and client code
 * can all use it.
 */

export const EXTENSION_IDS = ['grill', 'learn'] as const;
export type ExtensionId = (typeof EXTENSION_IDS)[number];

export const isExtensionId = (s: string): s is ExtensionId => (EXTENSION_IDS as readonly string[]).includes(s);

/** Whether each is on when `settings.yaml` doesn't say. Anything not built in starts off. */
export const BUILT_IN: Readonly<Record<ExtensionId, boolean>> = { grill: true, learn: false };

/** The site paths each owns, gated by the proxy while it's inactive. `*` matches one segment. */
export const PATH_PATTERNS: Readonly<Record<ExtensionId, readonly string[]>> = { grill: [], learn: [] };

const segments = (p: string) => p.split('/').filter(Boolean);

/** Whether `pathname` is `pattern` or below it, segment by segment: `/learn` matches `/learn/x`, not `/learning`. */
export function matchesPattern(pathname: string, pattern: string): boolean {
  const path = segments(pathname);
  const pat = segments(pattern);
  return pat.length <= path.length && pat.every((s, i) => s === '*' || s === path[i]);
}

/** The first extension in `ids` whose patterns match `pathname`. */
export function ownerOfPath(pathname: string, ids: Iterable<ExtensionId>): ExtensionId | undefined {
  for (const id of ids) if (PATH_PATTERNS[id].some((p) => matchesPattern(pathname, p))) return id;
}
