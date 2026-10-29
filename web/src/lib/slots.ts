/**
 * What an extension adds to the site's pages beyond its session kind (`session-kind.ts`). Its server part, in its
 * `manifest.server.ts` (listed in `extensions.server.ts`), loads its loaders only when they're called; its browser
 * part, in `manifest.client.tsx` (`extensions.client.ts`), is what the nav and palette draw. Its Markdown syntax is
 * a handler in `extensions.markdown.ts`. Only active extensions' slots are used.
 */
import type { ComponentType, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { ExtensionId } from "../../../src/extension-ids.ts";
import type { GridSource } from "../../../src/home.ts";
import type { Slot } from "../components/layout/shell-slot.tsx";
import type { ItemContext } from "./session-kind.ts";
import type { SessionBase } from "./sessions.ts";

/** What the palette's names are built from: the listed sessions, as the lists file them. */
export type SearchContext<S extends SessionBase = SessionBase> = { sessions: S[]; ctx: ItemContext };

export type ServerSlots = {
  id: ExtensionId;
  /** Its names for the palette, merged into `/api/search`. */
  search?(c: SearchContext): Promise<object>;
  /** Its section on Home, after In flight. */
  home?(): Promise<ComponentType>;
  /** What it adds to Home's activity grid. */
  grid?(): Promise<GridSource>;
};

export type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  on: (pathname: string) => boolean;
  /** Whether the open page is one of its sections', which the sidebar lights instead. */
  parent?: (slot: Slot) => boolean;
};

/** A palette group's props: the search index, and a select handler that closes the palette and goes to `href`. */
export type PaletteProps<I> = { index: I; go: (href: string) => () => void };

export type ClientSlots<I = unknown> = {
  id: ExtensionId;
  /** Its app nav entries, after the core's. */
  nav?: NavItem[];
  /** The icons of the sidebar sections its pages list, by label. */
  sectionIcons?: Record<string, LucideIcon>;
  /** Its palette groups: `Browse` after Projects, `Found` after Issues once there's a query. */
  Browse?(props: PaletteProps<I>): ReactNode;
  Found?(props: PaletteProps<I>): ReactNode;
};
