/**
 * The site's built-in session kinds in the browser: each extension's `(browse)/(<id>)/_components/manifest.client.tsx`.
 * The root layout passes the active ids down; a Tab is drawn by its own kind, which the server only lists while active.
 */
import { client as grill } from "@/app/(browse)/(grill)/_components/manifest.client";
import { client as learn } from "@/app/(browse)/(learn)/_components/manifest.client";
import type { ExtensionId } from "../../../src/extension-ids.ts";
import type { LiveItem } from "./data";
import type { ClientKind } from "./session-kind";

export const CLIENT_KINDS = [grill, learn] as readonly ClientKind[];

export const clientKind = (s: Pick<LiveItem, "kind">): ClientKind<LiveItem> => CLIENT_KINDS.find((k) => k.kind === s.kind)! as ClientKind<LiveItem>;

export const activeClientKinds = (active: readonly ExtensionId[]) => CLIENT_KINDS.filter((k) => active.includes(k.id));
