/** The shell's rules: what kind of page is open, the sidebar each kind opens with, and the Tab the Drawer shows. */

/** A Workspace opens with the sidebar collapsed to the rail; a Reading page opens it expanded. */
export type PageKind = "workspace" | "reading";

/** Whether the sidebar is collapsed, per kind: the last toggle on a kind of page wins for that kind. */
export type Collapsed = Record<PageKind, boolean>;

export const COLLAPSED_DEFAULTS: Collapsed = { workspace: true, reading: false };

/** localStorage keys, beside the per-session `sear:session:<slug>`. */
export const SIDEBAR_KEY = "sear:sidebar";
export const TAB_KEY = "sear:tab";
export const DRAWER_KEY = "sear:drawer";

/** The grill a `/s/<slug>` page shows, else null. */
export function sessionSlug(pathname: string): string | null {
  const m = /^\/s\/([^/?#]+)/.exec(pathname);
  return m ? decodeURIComponent(m[1]) : null;
}

/** Grills are Workspaces (lessons and a course's Work join them later); every other page is a Reading page. */
export function pageKind(pathname: string): PageKind {
  return sessionSlug(pathname) ? "workspace" : "reading";
}

export function parseCollapsed(raw: string | null): Collapsed {
  try {
    const v = JSON.parse(raw ?? "") as Partial<Record<PageKind, unknown>>;
    return {
      workspace: typeof v.workspace === "boolean" ? v.workspace : COLLAPSED_DEFAULTS.workspace,
      reading: typeof v.reading === "boolean" ? v.reading : COLLAPSED_DEFAULTS.reading,
    };
  } catch {
    return { ...COLLAPSED_DEFAULTS };
  }
}

/** The Tab the Drawer shows: the open page's when it's live, else the last one picked while still live, else the first. */
export function selectTab(live: string[], page: string | null, last: string | null): string | null {
  if (page && live.includes(page)) return page;
  if (last && live.includes(last)) return last;
  return live[0] ?? null;
}

/** Not found's one line (grill Q36): what's missing, and the nearest real page to go back to. */
export function missing(pathname: string): { what: string; back: { href: string; label: string } } {
  const grill = sessionSlug(pathname);
  if (grill) return { what: `No grill ${grill}.`, back: { href: "/", label: "Back home" } };
  const project = /^\/p\/([^/?#]+)\/?$/.exec(pathname)?.[1];
  if (project) return { what: `No project ${decodeURIComponent(project).toUpperCase()}.`, back: { href: "/p", label: "Back to Projects" } };
  return { what: `No page at ${pathname}.`, back: { href: "/", label: "Back home" } };
}

export type DrawerPrefs = { open: boolean; width: number };

export const DRAWER_DEFAULTS: DrawerPrefs = { open: true, width: 420 };

export const clampDrawer = (w: number) => Math.min(760, Math.max(320, Math.round(w)));

export function parseDrawer(raw: string | null): DrawerPrefs {
  try {
    const v = JSON.parse(raw ?? "") as Partial<Record<keyof DrawerPrefs, unknown>>;
    return {
      open: typeof v.open === "boolean" ? v.open : DRAWER_DEFAULTS.open,
      width: typeof v.width === "number" && Number.isFinite(v.width) ? clampDrawer(v.width) : DRAWER_DEFAULTS.width,
    };
  } catch {
    return { ...DRAWER_DEFAULTS };
  }
}
