/**
 * What an extension adds to the site's pages beyond its session kind (`session-kind.ts`). Its page rules, in its pure
 * `manifest.ts` (`extensions.ts`), are what the shell, sidebar and Not found go by. Its server part, in its
 * `manifest.server.ts` (listed in `extensions.server.ts`), loads its loaders only when they're called; its browser
 * part, in `manifest.client.tsx` (`extensions.client.ts`), is what the nav, palette and issue page draw. Its Markdown
 * syntax is a handler in `extensions.markdown.ts`. Only active extensions' slots are used, except by Settings, which
 * lists them all.
 */
import type { ComponentType, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import type { ExtensionId } from "../../../src/extension-ids.ts";
import type { GridSource } from "../../../src/home.ts";
import type { Issue } from "../../../src/store.ts";
import type { Fact } from "../components/belay/facts.tsx";
import type { MarkProps } from "../components/layout/logo.tsx";
import type { Slot } from "../components/layout/shell-slot.tsx";
import type { LiveSession } from "./hub.ts";
import type { Project } from "./projects.ts";
import type { ItemContext } from "./session-kind.ts";
import type { SessionBase } from "./sessions.ts";

/** Not found's one line: what's missing, and the nearest real page to go back to. */
export type Missing = { what: string; back: { href: string; label: string } };

/** A project section, at `/p/<key><suffix>`. */
export type ProjectSection = { label: string; suffix: string };

export type SidebarRow = { label: string; href: string; on: boolean };

/** A live Tab as the page rules see it: its slug, and whatever its kind keys pages by (a lesson's course). */
export type LiveRef = { slug: string; [field: string]: unknown };

/** What an extension adds to the shell's page rules. */
export type ShellRules = {
  /** Whether one of its pages is a Workspace. */
  workspace?(pathname: string): boolean;
  /** The live Tab one of its pages belongs to. */
  tab?(pathname: string, live: readonly LiveRef[]): string | null;
  /** Not found's line for one of its addresses. */
  missing?(pathname: string): Missing | null;
  /** Its sections of every project, after Issues. */
  sections?: readonly ProjectSection[];
  /** A project of its own, listed on Projects, that has only its sections: Unfiled. */
  pseudo?: { key: string; name: string };
  /** The section rows of a place it owns (a course), named by the `owner` its pages pass to `<ShellSlot>`. */
  place?(key: string, pathname: string, section?: string): SidebarRow[];
};

/** What the palette's names are built from: the listed sessions, as the lists file them. */
export type SearchContext<S extends SessionBase = SessionBase> = { sessions: S[]; ctx: ItemContext };

/** What Projects and In flight are built from: the lists, belay's projects, and the live sessions. */
export type ListsContext<S extends SessionBase = SessionBase> = SearchContext<S> & { projects: Project[]; live: LiveSession[] };

/** A card on Projects after the projects themselves. */
export type ProjectEntry = { key: string; name: string; facts: string };

/** A group in Home's In flight, after Issues. */
export type FlightGroup = { id: string; label: string; count: number; rows: ReactNode };

export type ServerSlots = {
  id: ExtensionId;
  /** Its names for the palette, merged into `/api/search`. */
  search?(c: SearchContext): Promise<object>;
  /** Its section on Home, after In flight. */
  home?(): Promise<ComponentType>;
  /** What it adds to Home's activity grid. */
  grid?(): Promise<GridSource>;
  /** Its In flight group; null when it has nothing in flight. */
  flight?(c: ListsContext): Promise<FlightGroup | null>;
  /** Its cards on Projects. */
  projects?(c: ListsContext): Promise<ProjectEntry[]>;
  /** Its project sections' pages, by the address segment its `ShellRules.sections` give. */
  sections?: Record<string, () => Promise<ComponentType<{ projectKey: string }>>>;
  /** What its issue facts and actions are drawn from, sent to the browser, so plain data. */
  issue?(issue: Issue, data: string): Promise<unknown>;
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

type Result = { error?: string } | undefined;

/** Runs an action under the issue page's pending state, toasting its error. */
export type Run = (action: () => Promise<Result>) => void;

export type IssueAction = { id: string; label: string; run: () => Promise<Result> };

export type ClientSlots<I = unknown, D = unknown> = {
  id: ExtensionId;
  /** Its card on Settings, listed whether it's active or not: name, one-line summary and Extension mark. */
  name: string;
  summary: string;
  Mark: ComponentType<MarkProps>;
  /** Its app nav entries, after the core's. */
  nav?: NavItem[];
  /** The icons of the sidebar sections its pages list, by label. */
  sectionIcons?: Record<string, LucideIcon>;
  /** Its palette groups: `Browse` after Projects, `Found` after Issues once there's a query. */
  Browse?(props: PaletteProps<I>): ReactNode;
  Found?(props: PaletteProps<I>): ReactNode;
  /** Its issue facts, after Source, from what its server `issue` sent. */
  issueFacts?(id: string, data: D, run: Run, pending: boolean): Fact[];
  /** Its entries in the issue's ⋯, before Open file. */
  issueActions?(id: string, data: D): IssueAction[];
};
