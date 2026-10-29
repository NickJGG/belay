/**
 * The site's session kinds and slots in the browser: each installed extension's `_components/manifest.client.tsx`
 * (listed by the generated `extensions.client.generated.ts`). The root layout passes the active ids down; a Tab is drawn by its
 * own kind, which the server only lists while active.
 */
import type { ExtensionId } from "../../../src/extension-ids.ts";
import type { LiveItem, SearchIndex } from "./data";
import { KINDS, SLOTS } from "./extensions.client.generated.ts";
import type { ClientKind } from "./session-kind";
import type { ClientSlots } from "./slots";

export const CLIENT_KINDS = KINDS as readonly ClientKind[];
// Each palette is handed the merged index and reads its own extension's part of it.
export const CLIENT_SLOTS = SLOTS as unknown as readonly ClientSlots<SearchIndex>[];

export const clientKind = (s: Pick<LiveItem, "kind">): ClientKind<LiveItem> => CLIENT_KINDS.find((k) => k.kind === s.kind)! as ClientKind<LiveItem>;

export const activeClientKinds = (active: readonly ExtensionId[]) => CLIENT_KINDS.filter((k) => active.includes(k.id));

export const activeClientSlots = (active: readonly ExtensionId[]) => CLIENT_SLOTS.filter((s) => active.includes(s.id));
