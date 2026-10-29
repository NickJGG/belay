/**
 * The site's extension list: each installed extension's pure descriptor from its `_lib/manifest.ts` (listed by the
 * generated `extensions.generated.ts`), safe for the browser, and what their session kinds add up to. Their server
 * parts are listed in `extensions.server.ts`.
 */
import type { ExtensionId } from "../../../src/extension-ids.ts";
import { MANIFESTS } from "./extensions.generated.ts";
import type { PureKind } from "./session-kind.ts";
import type { ShellRules } from "./slots.ts";

export { MANIFESTS };

/** The active extensions' page rules, in built-in order. */
export const shellRules = (active: readonly ExtensionId[]): (ShellRules & { id: ExtensionId })[] =>
  MANIFESTS.filter((m) => active.includes(m.id)).map((m) => ({ id: m.id, ...(m.shell as ShellRules) }));

/** The extension whose pseudo-project `key` is, active or not. */
export const pseudoOwner = (key: string): ExtensionId | undefined => MANIFESTS.find((m) => (m.shell as ShellRules).pseudo?.key === key)?.id;

/** What a live session's page can follow, as its kind's `focus` parsed it; the kind reads its own. */
export type Focus = Readonly<Record<string, unknown>>;

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
