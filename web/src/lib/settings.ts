/** Settings' view of each Extension card and the Glow row, kept pure for `node --test`. */
import type { ExtensionId } from "../../../src/extension-ids.ts";

/** What the server knows of an extension: its setting, and its sessions with a bridge attached. */
export type ExtensionState = { id: ExtensionId; on: boolean; attached: string[] };

/**
 * A card: its Off is locked while it's on and one of its sessions is attached, as the CLI refuses `off` then; `inUse`
 * names those sessions for the lock's line.
 */
export function extensionCard(s: ExtensionState): { locked: boolean; inUse: string[] } {
  const locked = s.on && s.attached.length > 0;
  return { locked, inUse: locked ? s.attached : [] };
}

/** Glow only shows in the dark theme: in light its switch is greyed. Unmounted (`undefined`) counts as dark. */
export function glowRow(theme: string | undefined): { disabled: boolean; what: string } {
  return theme === "light" ? { disabled: true, what: "Dark theme only." } : { disabled: false, what: "A soft colour wash behind the page." };
}
