/**
 * The site's session kinds and slots on the server: each installed extension's `_lib/manifest.server.ts` (listed by the
 * generated `extensions.server.generated.ts`), and the core's ways of reaching them. Only active ones count, so an inactive kind's folder is never read.
 */
import "server-only";
import { dataDir } from "../../../src/config.ts";
import { installedIds, type ExtensionId } from "../../../src/extension-ids.ts";
import { isActive } from "../../../src/extensions.ts";
import type { ComponentType } from "react";
import type { GridSource } from "../../../src/home.ts";
import type { Issue } from "../../../src/store.ts";
import type { GrillSearch } from "../app/(browse)/(grill)/_lib/manifest.server.ts";
import type { GrillItem, GrillLive, runtime as grillRuntime } from "../app/(browse)/(grill)/_lib/runtime.server.ts";
import type { GrillSession } from "../app/(browse)/(grill)/_lib/sessions.ts";
import type { LearnSearch } from "../app/(browse)/(learn)/_lib/manifest.server.ts";
import type { LessonLive, runtime as learnRuntime } from "../app/(browse)/(learn)/_lib/runtime.server.ts";
import { KINDS, SLOTS } from "./extensions.server.generated.ts";
import { sessionKind, shellRules } from "./extensions.ts";
import type { ItemContext, KindRuntime, LiveSession, ServerKind } from "./session-kind.ts";
import { pseudoProject } from "./sidebar.ts";
import type { FlightGroup, ListsContext, ProjectEntry, SearchContext, ServerSlots } from "./slots.ts";
import type { SessionBase, SessionMemo } from "./sessions.ts";

export const SERVER_KINDS: readonly ServerKind[] = KINDS;
export const SERVER_SLOTS: readonly ServerSlots[] = SLOTS;

/** What the kinds' lists and Tabs add up to. */
export type ListedSession = GrillSession;
export type SessionItem = GrillItem;
export type LiveItem = Widen<GrillLive, LessonLive> | Widen<LessonLive, GrillLive>;

/** The palette's names the extensions add, merged flat. */
export type SearchParts = GrillSearch & LearnSearch;

/** One kind's Tab, with the other kinds' fields readable as undefined. */
type Widen<T, U> = T & { [K in Exclude<keyof U, keyof T>]?: undefined };

type Runtimes = { grill: typeof grillRuntime; learn: typeof learnRuntime };
type RuntimeOf<K extends ExtensionId> = K extends keyof Runtimes ? Runtimes[K] : KindRuntime;

export const activeIds = (data = dataDir()): ExtensionId[] => installedIds().filter((id) => isActive(id, data));

export const activeKinds = (data = dataDir()) => SERVER_KINDS.filter((k) => isActive(k.id, data));

/** The active kinds' session folders. */
export const sessionRoots = (data = dataDir()): Partial<Record<ExtensionId, string>> =>
  Object.fromEntries(activeKinds(data).map((k) => [k.id, k.root(data)]));

// On globalThis so dev-mode module reloads keep the loaded runtimes.
const g = globalThis as typeof globalThis & { __belayKinds?: Map<ExtensionId, Promise<KindRuntime>> };

/** A kind's runtime, loaded on first use. */
export function runtimeOf<K extends ExtensionId>(id: K): Promise<RuntimeOf<K>> {
  const loaded = (g.__belayKinds ??= new Map());
  let p = loaded.get(id);
  if (!p) loaded.set(id, (p = SERVER_KINDS.find((k) => k.id === id)!.load()));
  return p as Promise<RuntimeOf<K>>;
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

const activeSlots = (data = dataDir()) => SERVER_SLOTS.filter((s) => isActive(s.id, data));

/** The active extensions' palette names, merged in built-in order. */
export async function searchParts(c: SearchContext<ListedSession>): Promise<SearchParts> {
  const parts = await Promise.all(activeSlots().map((s) => s.search?.(c)));
  return Object.assign({}, ...parts) as SearchParts;
}

/** The active extensions' Home sections, in built-in order. */
export const homeSections = (): Promise<{ id: ExtensionId; Section: ComponentType }[]> =>
  Promise.all(activeSlots().flatMap((s) => (s.home ? [s.home().then((Section) => ({ id: s.id, Section }))] : [])));

/** What the active extensions add to Home's activity grid. */
export const gridSources = (): Promise<GridSource[]> => Promise.all(activeSlots().flatMap((s) => (s.grid ? [s.grid()] : [])));

/** The active extensions' In flight groups that have something in flight, in built-in order. */
export async function flightGroups(c: ListsContext<ListedSession>): Promise<FlightGroup[]> {
  const groups = await Promise.all(activeSlots().map((s) => s.flight?.(c)));
  return groups.filter((g) => !!g);
}

/** The active extensions' cards on Projects, in built-in order. */
export async function projectEntries(c: ListsContext<ListedSession>): Promise<ProjectEntry[]> {
  return (await Promise.all(activeSlots().map((s) => s.projects?.(c) ?? []))).flat();
}

/**
 * The project section at `/p/<key>/<segment>`, from the active extension that has it; null when none does, or when
 * `key` is another extension's pseudo-project.
 */
export async function projectSection(key: string, segment: string): Promise<{ label: string; Section: ComponentType<{ projectKey: string }> } | null> {
  const active = activeIds();
  const pseudo = pseudoProject(key, active);
  for (const rules of shellRules(active)) {
    const section = rules.sections?.find((s) => s.suffix === `/${segment}`);
    const page = SERVER_SLOTS.find((s) => s.id === rules.id)?.sections?.[segment];
    if (!section || !page || (pseudo && pseudo !== rules.id)) continue;
    return { label: section.label, Section: await page() };
  }
  return null;
}

/** What the active extensions' issue facts and actions draw from, by extension. */
export async function issueParts(issue: Issue, data: string): Promise<Partial<Record<ExtensionId, unknown>>> {
  const parts = await Promise.all(activeSlots(data).map(async (s) => [s.id, await s.issue?.(issue, data)] as const));
  return Object.fromEntries(parts.filter(([, d]) => d !== undefined));
}
