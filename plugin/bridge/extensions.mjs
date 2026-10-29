/**
 * Which extensions are Installed, read the way `src/extension-ids.ts` reads it (a test checks they agree): the
 * folders under `<clone>/extensions/` with a `belay.json`, narrowed by `extensions/installed.json` when there is one.
 * Claude Code runs the plugin from a copy in its cache, so the clone is found by `BELAY_REPO`, else two folders above
 * this file when the plugin runs in place, else the `belay` marketplace's directory in Claude Code's
 * `known_marketplaces.json`.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
const here = path.dirname(fileURLToPath(import.meta.url));
const isClone = (dir) => existsSync(path.join(dir, "extensions")) && existsSync(path.join(dir, "src", "extension-ids.ts"));
/** The `belay` marketplace's directory, if Claude Code added it from one. */
function marketplaceDir(home) {
    try {
        const j = JSON.parse(readFileSync(path.join(home, ".claude", "plugins", "known_marketplaces.json"), "utf8"));
        const src = j?.belay?.source;
        return src?.source === "directory" && typeof src.path === "string" ? src.path : undefined;
    }
    catch {
        return undefined;
    }
}
/** The Belay clone, or why none was found. */
export function findClone(env = process.env, home = os.homedir(), from = here) {
    const tried = [env.BELAY_REPO, path.resolve(from, "..", ".."), path.resolve(from, ".."), marketplaceDir(home)].filter((d) => !!d);
    const root = tried.find(isClone);
    return root ? { root } : { why: `no Belay clone at ${tried.join(", ")}` };
}
/** The installed ids in `root`, in folder order. Throws on a malformed `installed.json`. */
export function installedIn(root) {
    const dir = path.join(root, "extensions");
    const ids = readdirSync(dir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(path.join(dir, e.name, "belay.json")))
        .map((e) => e.name)
        .sort();
    const record = path.join(dir, "installed.json");
    if (!existsSync(record))
        return ids;
    const listed = JSON.parse(readFileSync(record, "utf8"))?.installed;
    if (!Array.isArray(listed))
        throw new Error('extensions/installed.json: expected { "installed": [<id>, …] }');
    return ids.filter((id) => listed.includes(id));
}
