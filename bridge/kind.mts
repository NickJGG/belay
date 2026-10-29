/**
 * A session kind: what an extension adds to the bridge. `kinds/index.mts` lists the built-in ones.
 *
 * Its descriptor (`kinds/<id>.mts`) loads at startup, so it stays light: INSTRUCTIONS, tool JSON, attach arguments and
 * wording. Its runtime (`kinds/<id>.runtime.mts`) loads on attach: zod schemas, handlers, notifications, its files and
 * step labels. A session's `state` is whatever its kind's runtime makes of the attach arguments.
 */
import type { BridgeEvent } from "./http.mts";
import type { Format, Head, MessageSchema } from "./protocol.mts";
import type { StepParts } from "./transcript.mts";

// Deferred behind ToolSearch, Claude answered channel messages in the terminal instead.
export const ALWAYS = { "anthropic/alwaysLoad": true };

export type Tool = { name: string; description: string; _meta: typeof ALWAYS; inputSchema: Record<string, unknown> };
export type CoreTool = "reply" | "choice" | "detach";
export type ToolResult = { content: { type: "text"; text: string }[]; isError?: boolean };

export const text = (t: string, isError = false): ToolResult => ({ content: [{ type: "text", text: t }], ...(isError ? { isError } : {}) });

export type IdleContext = {
  attached: () => boolean;
  notify: (content: string, meta: Record<string, string>) => Promise<void>;
  log: (...args: unknown[]) => void;
};

export type Kind<S = any> = {
  id: string;
  /** One session ("grill") and several ("grills"). */
  noun: string;
  plural: string;
  /** The skill that runs its sessions. */
  skill: string;
  /** Its sessions' folder in the data dir. */
  folder: string;
  /** The attach argument naming one of its sessions, and the attach properties it adds. */
  key: string;
  properties: Record<string, object>;
  /** Attach's description of it: "a grill by `slug` (…)". */
  attach: string;
  /** The advice for a channel message from another of its sessions: "to run `/grill resume <slug>` (a grill)". */
  resume: string;
  /** Its INSTRUCTIONS block. */
  instructions: string;
  /** Its tools while attached, in order; the core's by name. */
  tools: (Tool | CoreTool)[];
  /** Why a site message is refused after /clear. */
  reattach: (slug: string) => string;
  /** Its site page, for attach's answer. */
  page: (slug: string, state: S) => string;
  /** Runs once the MCP handshake is done (a lesson's queued start). */
  idle?: (ctx: IdleContext) => void;
  load: () => Promise<Runtime<S>>;
};

export type ToolContext<S> = { state: S; broadcast: (e: BridgeEvent) => void; log: (...args: unknown[]) => void };

export type Runtime<S = any> = {
  /** Its own site messages; with `exclusive`, other kinds' sessions refuse them. */
  messages: readonly MessageSchema[];
  exclusive: boolean;
  format: Format;
  /** The session the attach arguments name, or why they name none. */
  target: (args: Record<string, unknown>) => S | string;
  /** Whether `target` names the attached session. */
  same: (state: S, target: S) => boolean;
  slug: (target: S) => string;
  /** A first attach, before the bridge starts; a re-attach of the same session; a detach. */
  opened?: (dir: string, state: S) => void;
  reattached?: (dir: string, state: S, target: S) => void;
  closed?: (dir: string) => void;
  head: (slug: string, state: S) => Head;
  /** Sent to a page that connects, after the open turn. */
  snapshot?: (state: S) => BridgeEvent[];
  /** Its own tools; undefined for one it doesn't handle. */
  call?: (name: string, args: Record<string, unknown>, ctx: ToolContext<S>) => ToolResult | undefined;
  /** The drawer's row for a tool call, null to hide it, undefined to leave it to the core. */
  stepLabel?: (name: string, input: Record<string, unknown>, dir: string) => StepParts | null | undefined;
};
