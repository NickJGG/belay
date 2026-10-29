/** The bridge's built-in session kinds, and what their loaded runtimes add up to. */
import type { z } from "zod";
import type { Kind, Runtime } from "../kind.mts";
import type { AnyMessage, CoreMessage, Format } from "../protocol.mts";
import type { LabelContext } from "../transcript.mts";
import { grill } from "./grill.mts";
import type { GrillEvent, GrillMessage } from "./grill.runtime.mts";
import { learn } from "./learn.mts";
import type { LessonEvent, LessonMessage } from "./learn.runtime.mts";

export const KINDS: readonly Kind[] = [grill, learn];

/** Whether each is on when `settings.yaml` doesn't say, as in `src/extension-ids.ts` (a test checks they agree). */
export const BUILT_IN: Readonly<Record<string, boolean>> = { grill: true, learn: false };

/** The kinds whose setting takes effect; the rest are active whatever it says, as in `src/extensions.ts`. */
export const GATED: ReadonlySet<string> = new Set(["learn"]);

export type Message = CoreMessage | GrillMessage | LessonMessage;
export type KindEvent = GrillEvent | LessonEvent;

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
