/** The shell's rules: what kind of page is open, the sidebar each kind opens with, and the Tab the Drawer shows. */
import type { ExtensionId } from "../../../src/extension-ids.ts";
import { pseudoOwners, shellRules } from "./extensions.ts";
import type { LiveRef, Missing } from "./slots.ts";

/** A Workspace opens with the sidebar collapsed to the rail; a Reading page opens it expanded. */
export type PageKind = "workspace" | "reading";

/** Whether the sidebar is collapsed, per kind: the last toggle on a kind of page wins for that kind. */
export type Collapsed = Record<PageKind, boolean>;

export const COLLAPSED_DEFAULTS: Collapsed = { workspace: true, reading: false };

/** localStorage keys, beside the per-session `belay:session:<slug>`. */
export const SIDEBAR_KEY = "belay:sidebar";
export const TAB_KEY = "belay:tab";
export const DRAWER_KEY = "belay:drawer";
export const TABS_KEY = "belay:tabs";
export const SEEN_KEY = "belay:seen";
export const OUTLINE_KEY = "belay:outline";
export const GLOW_KEY = "belay:glow";

/** A stored on/off toggle: on unless the last toggle stored `false`. */
function parseToggle(raw: string | null): boolean {
  try {
    const v: unknown = JSON.parse(raw ?? "");
    return typeof v === "boolean" ? v : true;
  } catch {
    return true;
  }
}

/** Whether a grill's Outline is expanded: it is unless the last toggle collapsed it. */
export const parseOutline = parseToggle;

/** Whether the dark theme's ambient glow shows: it does unless the last toggle turned it off. */
export const parseGlow = parseToggle;

/** A page is a Workspace when an active extension says so (a grill, a lesson's Now); every other page is a Reading page. */
export function pageKind(pathname: string, active: readonly ExtensionId[]): PageKind {
  return shellRules(active).some((r) => r.workspace?.(pathname)) ? "workspace" : "reading";
}

/** The live Tab a page belongs to, by the first active extension that places it. */
export function pageTab(pathname: string, live: readonly LiveRef[], active: readonly ExtensionId[]): string | null {
  for (const r of shellRules(active)) {
    const tab = r.tab?.(pathname, live);
    if (tab) return tab;
  }
  return null;
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

/** The stored Tab order: a slug list, `[]` when missing or malformed. */
export function parseTabOrder(raw: string | null): string[] {
  try {
    const v: unknown = JSON.parse(raw ?? "");
    return Array.isArray(v) ? v.filter((s): s is string => typeof s === "string") : [];
  } catch {
    return [];
  }
}

/** The live Tabs in the stored order; ones it doesn't know yet join at the end, in their incoming order. */
export function orderTabs(live: string[], saved: string[]): string[] {
  const at = new Map(saved.map((s, i) => [s, i]));
  const known = live.filter((s) => at.has(s)).sort((a, b) => at.get(a)! - at.get(b)!);
  return [...known, ...live.filter((s) => !at.has(s))];
}

const TABS_KEPT = 30;

/**
 * The stored order after dropping `slug` at index `to` of the live Tabs. Slugs no longer live keep their places, so
 * one that comes back slots in where it was; past 30, the earliest of those go first, never a live one.
 */
export function moveTab(saved: string[], live: string[], slug: string, to: number): string[] {
  const order = orderTabs(live, saved).filter((s) => s !== slug);
  order.splice(Math.max(0, Math.min(to, order.length)), 0, slug);
  const isLive = new Set(live);
  const all = [...saved.filter((s) => s !== slug || isLive.has(s)), ...live.filter((s) => !saved.includes(s))];
  let next = 0;
  const out = all.map((s) => (isLive.has(s) ? order[next++] : s));
  let over = out.length - TABS_KEPT;
  return out.filter((s) => isLive.has(s) || over-- <= 0);
}

/** The Tabs opened in this browser: null when the key is missing (a first visit), `[]` when malformed. */
export function parseSeen(raw: string | null): string[] | null {
  if (raw === null) return null;
  return parseTabOrder(raw);
}

/**
 * The seen list after opening `slug`, most recent last. Slugs no longer live stay, so a grill that reattaches doesn't
 * come back New; past 30, the earliest of those go first, never a live one.
 */
export function markSeen(saved: string[], live: string[], slug: string): string[] {
  const all = [...saved.filter((s) => s !== slug), slug];
  const isLive = new Set(live);
  let over = all.length - TABS_KEPT;
  return all.filter((s) => s === slug || isLive.has(s) || over-- <= 0);
}

/** The live Tabs not yet opened in this browser. */
export function fresh(live: string[], seen: string[]): string[] {
  const known = new Set(seen);
  return live.filter((s) => !known.has(s));
}

/**
 * Not found's one line: what's missing, and the nearest real page to go back to. An inactive extension's addresses,
 * its project sections and pseudo-project included, get the generic line.
 */
export function missing(pathname: string, active: readonly ExtensionId[]): Missing {
  const rules = shellRules(active);
  for (const r of rules) {
    const m = r.missing?.(pathname);
    if (m) return m;
  }
  const generic = { what: `No page at ${pathname}.`, back: { href: "/", label: "Back home" } };
  const sections = ["activity", "logs", ...rules.flatMap((r) => r.sections ?? []).map((s) => s.suffix.slice(1))];
  const project = new RegExp(`^/p/([^/?#]+)(/(${sections.join("|")}))?/?$`).exec(pathname)?.[1];
  if (project) {
    const owners = pseudoOwners(decodeURIComponent(project));
    if (owners.length && !owners.some((id) => active.includes(id))) return generic;
    return { what: `No project ${decodeURIComponent(project).toUpperCase()}.`, back: { href: "/p", label: "Back to Projects" } };
  }
  const issue = /^\/i\/([^/?#]+)\/?$/.exec(pathname)?.[1];
  if (issue) {
    const id = decodeURIComponent(issue).toUpperCase();
    const key = /^([A-Z]+)-\d+$/.exec(id)?.[1];
    const back = key ? { href: `/p/${key}`, label: `Back to ${key}'s issues` } : { href: "/p", label: "Back to Projects" };
    return { what: `No issue ${id}.`, back };
  }
  if (pathname.startsWith("/l/")) return { what: "No log entry there.", back: { href: "/p", label: "Back to Projects" } };
  return generic;
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
