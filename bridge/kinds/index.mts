/**
 * The bridge's session kinds: each installed extension's descriptor, `extensions/<id>/bridge/<id>.mts` (compiled into
 * the plugin's own `extensions/`), and what their loaded runtimes add up to.
 */
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { z } from "zod";
import { findClone, installedIn } from "../extensions.mts";
import type { Kind, Runtime } from "../kind.mts";
import type { AnyMessage, CoreMessage, Format } from "../protocol.mts";
import type { LabelContext } from "../transcript.mts";

// Run from source (the tests) the descriptors are .mts; compiled, they're .mjs beside this file's tree.
const EXT = import.meta.url.endsWith(".mts") ? "mts" : "mjs";

/** Extension `id`'s descriptor in this bridge's tree. */
export function kindFile(id: string): string | undefined {
  const file = fileURLToPath(new URL(`../../extensions/${id}/bridge/${id}.${EXT}`, import.meta.url));
  return existsSync(file) ? file : undefined;
}

/** The installed extensions' kinds, and why any is missing. Outside a Belay clone, none. */
export async function installedKinds(found = findClone()): Promise<{ kinds: Kind[]; notes: string[] }> {
  if ("why" in found) return { kinds: [], notes: [`running core-only: ${found.why}`] };
  const kinds: Kind[] = [];
  const notes: string[] = [];
  let ids: string[];
  try {
    ids = installedIn(found.root);
  } catch (err) {
    return { kinds, notes: [`running core-only: ${err}`] };
  }
  for (const id of ids) {
    const file = kindFile(id);
    if (!file) {
      notes.push(`${id} is installed but this plugin has no bridge for it: update the plugin`);
      continue;
    }
    try {
      kinds.push((await import(pathToFileURL(file).href)).kind);
    } catch (err) {
      notes.push(`can't load ${id}'s bridge: ${err}`);
    }
  }
  return { kinds, notes };
}

const installed = await installedKinds();
export const KINDS: readonly Kind[] = installed.kinds;
export const KIND_NOTES: readonly string[] = installed.notes;

/** Whether each is on when `settings.yaml` doesn't say: every installed extension, as `src/extensions.ts` reads it. */
export const DEFAULTS: Readonly<Record<string, boolean>> = Object.fromEntries(KINDS.map((k) => [k.id, true]));

/** Core's messages; each kind's runtime parses and formats its own. */
export type Message = CoreMessage;

export type Loaded = { kind: Kind; runtime: Runtime };

export const loadKinds = (kinds: readonly Kind[] = KINDS): Promise<Loaded[]> =>
  Promise.all(kinds.map(async (kind) => ({ kind, runtime: await kind.load() })));

/** The loaded kinds' site messages, their notifications and step labels. */
export function compose(loaded: readonly Loaded[]) {
  const owner = new Map<string, Loaded>();
  for (const l of loaded) for (const s of l.runtime.messages) owner.set((s.shape.kind as z.ZodLiteral<string>).value, l);
  const format: Format = (m: AnyMessage, head, meta) => owner.get(m.kind)?.runtime.format(m, head, meta);
  const stepLabel: NonNullable<LabelContext["label"]> = (name, input, dir) => {
    for (const l of loaded) {
      const row = l.runtime.stepLabel?.(name, input, dir);
      if (row !== undefined) return row;
    }
    return undefined;
  };
  return {
    messages: loaded.flatMap((l) => l.runtime.messages),
    format,
    stepLabel,
    /** The kind that keeps `kind` messages to its own sessions, if one does. */
    exclusiveOwner(kind: string): Kind | undefined {
      const o = owner.get(kind);
      return o?.runtime.exclusive ? o.kind : undefined;
    },
  };
}
export type Composed = ReturnType<typeof compose>;
