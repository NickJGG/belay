var __rewriteRelativeImportExtension = (this && this.__rewriteRelativeImportExtension) || function (path, preserveJsx) {
    if (typeof path === "string" && /^\.\.?\//.test(path)) {
        return path.replace(/\.(tsx)$|((?:\.d)?)((?:\.[^./]+?)?)\.([cm]?)ts$/i, function (m, tsx, d, ext, cm) {
            return tsx ? preserveJsx ? ".jsx" : ".js" : d && (!ext || !cm) ? m : (d + ext + "." + cm.toLowerCase() + "js");
        });
    }
    return path;
};
/**
 * The bridge's session kinds: each installed extension's descriptor, `extensions/<id>/bridge/<id>.mts` (compiled into
 * the plugin's own `extensions/`), and what their loaded runtimes add up to.
 */
import { existsSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";
import { findClone, installedIn } from "../extensions.mjs";
// Run from source (the tests) the descriptors are .mts; compiled, they're .mjs beside this file's tree.
const EXT = import.meta.url.endsWith(".mts") ? "mts" : "mjs";
/** Extension `id`'s descriptor in this bridge's tree. */
export function kindFile(id) {
    const file = fileURLToPath(new URL(`../../extensions/${id}/bridge/${id}.${EXT}`, import.meta.url));
    return existsSync(file) ? file : undefined;
}
/** The installed extensions' kinds, and why any is missing. Outside a Belay clone, none. */
export async function installedKinds(found = findClone()) {
    if ("why" in found)
        return { kinds: [], notes: [`running core-only: ${found.why}`] };
    const kinds = [];
    const notes = [];
    let ids;
    try {
        ids = installedIn(found.root);
    }
    catch (err) {
        return { kinds, notes: [`running core-only: ${err}`] };
    }
    for (const id of ids) {
        const file = kindFile(id);
        if (!file) {
            notes.push(`${id} is installed but this plugin has no bridge for it: update the plugin`);
            continue;
        }
        try {
            kinds.push((await import(__rewriteRelativeImportExtension(pathToFileURL(file).href))).kind);
        }
        catch (err) {
            notes.push(`can't load ${id}'s bridge: ${err}`);
        }
    }
    return { kinds, notes };
}
const installed = await installedKinds();
export const KINDS = installed.kinds;
export const KIND_NOTES = installed.notes;
/** Whether each is on when `settings.yaml` doesn't say: every installed extension, as `src/extensions.ts` reads it. */
export const DEFAULTS = Object.fromEntries(KINDS.map((k) => [k.id, true]));
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
