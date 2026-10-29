/**
 * A session kind: what an extension adds to the site's live sessions (`lib/extensions.ts` and `extensions.server.ts`
 * list the built-in ones). Its pure part, in its `manifest.ts`, is safe for the browser: its permission-card lines,
 * its focus parser and its reattach hint. Its server part, in `manifest.server.ts`, is light: its sessions' folder,
 * with `load()` bringing its session reader, list rows, Live Tabs and watchers the first time they're needed. Its
 * browser part, in `_components/manifest.client.tsx` (`lib/extensions.client.ts`), draws its Tabs and Drawer.
 */
import type { FSWatcher } from "chokidar";
import type { ReactNode } from "react";
import type { ExtensionId } from "../../../src/extension-ids.ts";
import type { LiveEvent } from "../components/live/event-hub.ts";
import type { LinkState } from "../components/session/drawer.tsx";
import type { ChatEntry } from "./chat.ts";
import type { HubEvent } from "./hub.ts";
import type { Issue } from "./issues.ts";
import type { MarkdownContext } from "./markdown.ts";
import type { SessionBase, SessionMemo } from "./sessions.ts";

export type PureKind<F = unknown> = {
  /** Its Belay MCP tools' permission-card lines, by tool name. */
  tools: Readonly<Record<string, string>>;
  /** A bridge `show` event as its focus, which a page opened later can follow; null when it isn't its own. */
  focus?: (e: Record<string, unknown>) => F | null;
  /** Why a site message can't reach its detached session. */
  reattach: (slug: string) => string;
};

/**
 * The project a session is filed under, for its marker; `iconV` (the icon's mtime) is set when it has an icon, and
 * `color` when belay gives it one.
 */
export type Mark = { key: string; name: string; iconV?: number; color?: string };

/** `wt`: its terminal is a Windows Terminal tab, which the bridge can focus. */
export type LiveSession = { slug: string; working: boolean; connected: boolean; sessionId: string | null; wt: boolean };

/** A session as the lists show it; its kind adds the rest. */
export type ItemBase = Pick<SessionBase, "slug" | "topic" | "status" | "project" | "updated" | "open"> & {
  live: boolean;
  /** Null when unfiled. */
  mark: Mark | null;
};

/** A live Tab; `href` is the page it opens. */
export type LiveBase = ItemBase & Pick<LiveSession, "working" | "connected" | "wt"> & { kind: string; href: string };

/** What turns a session into a list item, beyond the session itself. */
export type ItemContext = { live: Set<string>; marks: Map<string, Mark>; byGrill: Map<string, Issue[]> };

/** Written as methods, whose parameters TS checks both ways, so every kind's runtime is a plain `KindRuntime` too. */
export type KindRuntime<S extends SessionBase = SessionBase, L extends LiveBase = LiveBase, I extends ItemBase = ItemBase> = {
  /** One of its sessions under its folder, or null when the folder isn't one. */
  read(root: string, slug: string, memo?: SessionMemo): S | null;
  /** The sessions it lists (a grill's lists; lessons only show as live Tabs). */
  list?(root: string, memo?: SessionMemo): S[];
  /** A listed session as a list row. */
  item?(s: S, ctx: ItemContext): I;
  /** Its live Tabs, in the order given; `s` is null for a live session whose folder it can't read. */
  liveItems(entries: { l: LiveSession; s: S | null }[], ctx: ItemContext): Promise<L[]>;
  /** Watchers beyond its session folder's, run while it's active. */
  watch?(emit: (e: HubEvent) => void): FSWatcher[];
};

export type ServerKind = {
  id: ExtensionId;
  /** Its sessions' folder in the data dir. */
  root: (data: string) => string;
  /** Claims the live sessions no other kind reads as its own. */
  fallback?: boolean;
  load: () => Promise<KindRuntime>;
};

/** A composer a kind puts up in the Drawer: Send posts `message(text)` instead of a chat, and pictures can't go alone. */
export type Composer = { message(text: string): Record<string, unknown>; placeholder: string; chip: ReactNode; cancel(): void };

/** A kind's browser part, for its Tabs `L`. The shell draws an active kind's Drawer messages, refreshes and mounts. */
export type ClientKind<L extends LiveBase = LiveBase> = {
  id: ExtensionId;
  /** Its Tabs' `kind`. */
  kind: string;
  title(s: L): string;
  /** Its Tab's project or course, for the hover title. */
  place(s: L): string;
  mark(s: L): ReactNode;
  /** A chat entry it draws its own way; undefined when the entry isn't its own. */
  entry?(e: ChatEntry, ctx: { slug: string; md?: MarkdownContext }): ReactNode | undefined;
  /** The Drawer's banner while its session can't be answered. */
  banner(link: Exclude<LinkState, { state: "connected" }>, slug: string): ReactNode;
  /** Wraps the Drawer to hand it the kind's composer, null while none is up. */
  Composer?: (props: { children: (c: Composer | null) => ReactNode }) => ReactNode;
  /** Its state around the shell, which its own hooks read. */
  Provider?: (props: { children: ReactNode }) => ReactNode;
  /** Whether a live event re-renders the page, beyond the events the core refreshes on. */
  refresh?(e: LiveEvent): boolean;
  /** Mounted in the shell: `Frame` before the nav, `Main` after the page. */
  Frame?: () => ReactNode;
  Main?: () => ReactNode;
};
