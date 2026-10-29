/**
 * The site's built-in session kinds and slots in the browser: each extension's
 * `(browse)/(<id>)/_components/manifest.client.tsx`. The root layout passes the active ids down; a Tab is drawn by its
 * own kind, which the server only lists while active.
 */
import { client as grill, slots as grillSlots } from "@/app/(browse)/(grill)/_components/manifest.client";
import { client as learn, slots as learnSlots } from "@/app/(browse)/(learn)/_components/manifest.client";
import type { ExtensionId } from "../../../src/extension-ids.ts";
import type { LiveItem, SearchIndex } from "./data";
import type { ClientKind } from "./session-kind";
import type { ClientSlots } from "./slots";

export const CLIENT_KINDS = [grill, learn] as readonly ClientKind[];
export const CLIENT_SLOTS = [grillSlots, learnSlots] as readonly ClientSlots<SearchIndex>[];

export const clientKind = (s: Pick<LiveItem, "kind">): ClientKind<LiveItem> => CLIENT_KINDS.find((k) => k.kind === s.kind)! as ClientKind<LiveItem>;

export const activeClientKinds = (active: readonly ExtensionId[]) => CLIENT_KINDS.filter((k) => active.includes(k.id));

export const activeClientSlots = (active: readonly ExtensionId[]) => CLIENT_SLOTS.filter((s) => active.includes(s.id));
