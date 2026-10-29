/**
 * The site's built-in session kinds on the server: each extension's `(browse)/(<id>)/_lib/manifest.server.ts`, and
 * the core's ways of reaching them. Only active kinds count, so an inactive kind's folder is never read.
 */
import "server-only";
import { dataDir } from "../../../src/config.ts";
import type { ExtensionId } from "../../../src/extension-ids.ts";
import { isActive } from "../../../src/extensions.ts";
import { server as grill } from "../app/(browse)/(grill)/_lib/manifest.server.ts";
import type { GrillItem, GrillLive, runtime as grillRuntime } from "../app/(browse)/(grill)/_lib/runtime.server.ts";
import type { GrillSession } from "../app/(browse)/(grill)/_lib/sessions.ts";
import { server as learn } from "../app/(browse)/(learn)/_lib/manifest.server.ts";
import type { LessonLive, runtime as learnRuntime } from "../app/(browse)/(learn)/_lib/runtime.server.ts";
import { sessionKind } from "./extensions.ts";
import type { ItemContext, KindRuntime, LiveSession, ServerKind } from "./session-kind.ts";
import type { SessionBase, SessionMemo } from "./sessions.ts";

export const SERVER_KINDS: readonly ServerKind[] = [grill, learn];

/** What the kinds' lists and Tabs add up to. */
export type ListedSession = GrillSession;
export type SessionItem = GrillItem;
export type LiveItem = Widen<GrillLive, LessonLive> | Widen<LessonLive, GrillLive>;

/** One kind's Tab, with the other kinds' fields readable as undefined. */
type Widen<T, U> = T & { [K in Exclude<keyof U, keyof T>]?: undefined };

type Runtimes = { grill: typeof grillRuntime; learn: typeof learnRuntime };

export const activeKinds = (data = dataDir()) => SERVER_KINDS.filter((k) => isActive(k.id, data));

/** The active kinds' session folders. */
export const sessionRoots = (data = dataDir()): Partial<Record<ExtensionId, string>> =>
  Object.fromEntries(activeKinds(data).map((k) => [k.id, k.root(data)]));

// On globalThis so dev-mode module reloads keep the loaded runtimes.
const g = globalThis as typeof globalThis & { __belayKinds?: Map<ExtensionId, Promise<KindRuntime>> };

/** A kind's runtime, loaded on first use. */
export function runtimeOf<K extends ExtensionId>(id: K): Promise<Runtimes[K]> {
  const loaded = (g.__belayKinds ??= new Map());
  let p = loaded.get(id);
  if (!p) loaded.set(id, (p = SERVER_KINDS.find((k) => k.id === id)!.load()));
  return p as Promise<Runtimes[K]>;
}

export type Loaded = { id: ExtensionId; root: string; fallback: boolean; runtime: KindRuntime };

/** The active kinds with their runtimes, in built-in order. */
export const loadKinds = (data = dataDir()): Promise<Loaded[]> =>
  Promise.all(activeKinds(data).map(async (k) => ({ id: k.id, root: k.root(data), fallback: !!k.fallback, runtime: await runtimeOf(k.id) })));

export type Claim = { kind: Loaded; s: SessionBase | null };

/**
 * Each live session with the kind it belongs to: the first kind that reads its folder as its own, else the fallback
 * kind, which takes it even unread. A live session no active kind takes is left out.
 */
export function claim(live: LiveSession[], kinds: Loaded[], memo?: SessionMemo): Map<string, Claim> {
  const out = new Map<string, Claim>();
  for (const l of live) {
    for (const kind of kinds) {
      if (kind.fallback) continue;
      const s = kind.runtime.read(kind.root, l.slug, memo);
      if (s) {
        out.set(l.slug, { kind, s });
        break;
      }
    }
    const fallback = kinds.find((k) => k.fallback);
    if (!out.has(l.slug) && fallback) out.set(l.slug, { kind: fallback, s: fallback.runtime.read(fallback.root, l.slug, memo) });
  }
  return out;
}

/** The claimed live sessions' Tabs, each built by its kind, in `live`'s order. */
export async function liveItems(live: LiveSession[], claims: Map<string, Claim>, ctx: ItemContext): Promise<LiveItem[]> {
  const byKind = new Map<Loaded, { l: LiveSession; s: SessionBase | null }[]>();
  for (const l of live) {
    const c = claims.get(l.slug);
    if (c) byKind.set(c.kind, [...(byKind.get(c.kind) ?? []), { l, s: c.s }]);
  }
  const built = new Map<string, LiveItem>();
  await Promise.all(
    [...byKind].map(async ([kind, entries]) => {
      for (const item of (await kind.runtime.liveItems(entries, ctx)) as LiveItem[]) built.set(item.slug, item);
    }),
  );
  return live.flatMap((l) => built.get(l.slug) ?? []);
}

/** Why a site message can't reach the slug's session: its kind's hint, else the first active kind's. */
export function reattachHint(slug: string, id?: ExtensionId): string {
  const kind = id ?? activeKinds()[0]?.id;
  return kind ? sessionKind(kind).reattach(slug) : "Not attached";
}
