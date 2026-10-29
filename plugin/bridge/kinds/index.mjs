import { grill } from "./grill.mjs";
import { learn } from "./learn.mjs";
export const KINDS = [grill, learn];
/** Whether each is on when `settings.yaml` doesn't say, as in `src/extension-ids.ts` (a test checks they agree). */
export const BUILT_IN = { grill: true, learn: false };
export const loadKinds = (kinds = KINDS) => Promise.all(kinds.map(async (kind) => ({ kind, runtime: await kind.load() })));
/** The loaded kinds' site messages, their notifications and step labels. */
export function compose(loaded) {
    const owner = new Map();
    for (const l of loaded)
        for (const s of l.runtime.messages)
            owner.set(s.shape.kind.value, l);
    const format = (m, head, meta) => owner.get(m.kind)?.runtime.format(m, head, meta);
    const stepLabel = (name, input, dir) => {
        for (const l of loaded) {
            const row = l.runtime.stepLabel?.(name, input, dir);
            if (row !== undefined)
                return row;
        }
        return undefined;
    };
    return {
        messages: loaded.flatMap((l) => l.runtime.messages),
        format,
        stepLabel,
        /** The kind that keeps `kind` messages to its own sessions, if one does. */
        exclusiveOwner(kind) {
            const o = owner.get(kind);
            return o?.runtime.exclusive ? o.kind : undefined;
        },
    };
}
