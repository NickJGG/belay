/**
 * The site's built-in extension list: each extension's pure descriptor from `(browse)/(<id>)/_lib/manifest.ts`, safe
 * for the browser, and what their session kinds add up to. Their server parts are listed in `extensions.server.ts`.
 */
import type { ExtensionId } from "../../../src/extension-ids.ts";
import { manifest as grill } from "../app/(browse)/(grill)/_lib/manifest.ts";
import { manifest as learn } from "../app/(browse)/(learn)/_lib/manifest.ts";
import type { LessonShow } from "./lesson.ts";
import type { PureKind } from "./session-kind.ts";

export const MANIFESTS = [grill, learn] as const;

/** What a live session's page can follow: the focus types of every kind that has one. */
export type Focus = LessonShow;

/** The Belay MCP tools the kinds add, with their permission-card lines. */
export const KIND_TOOLS: Readonly<Record<string, string>> = Object.assign({}, ...MANIFESTS.map((m) => m.session.tools));

/** A bridge `show` event as the first kind's focus that takes it, or null. */
export function parseFocus(e: Record<string, unknown>): Focus | null {
  for (const m of MANIFESTS) {
    const f = (m.session as PureKind<Focus>).focus?.(e);
    if (f) return f;
  }
  return null;
}

export const sessionKind = (id: ExtensionId): PureKind => MANIFESTS.find((m) => m.id === id)!.session;

/** The site's description, naming what the active extensions add to projects. */
export function siteDescription(active: readonly ExtensionId[]): string {
  const nouns = ["Projects", ...MANIFESTS.filter((m) => active.includes(m.id)).map((m) => m.noun)];
  const list = nouns.length > 1 ? `${nouns.slice(0, -1).join(", ")} and ${nouns.at(-1)}` : nouns[0];
  return `${list}, worked through Claude Code sessions.`;
}
