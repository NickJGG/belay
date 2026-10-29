/**
 * `settings.yaml`'s `extensions:` map, read the way `src/extensions.ts` reads it (a test checks they agree): `on`/`true`
 * and `off`/`false`, anything else at its built-in default. A file that won't read or parse keeps the last good value,
 * or turns every kind on if there never was one. The plugin is installed apart from `src/`, so it has its own copy.
 */
import { readFileSync, statSync } from "node:fs";
import path from "node:path";

type Yaml = typeof import("yaml");
let yaml: Yaml | null = null;

/** Loads `yaml` once. Without it no settings file parses, so every kind stays on. */
export async function loadYaml(log: (...args: unknown[]) => void) {
  try {
    yaml ??= await import("yaml");
  } catch (err) {
    log(`can't load yaml, so every session kind stays on: ${err}`);
  }
}

type Enabled = Record<string, boolean>;
const SWITCH: Record<string, boolean> = { on: true, true: true, off: false, false: false };

/** The `extensions:` map of a `settings.yaml`, over `defaults`. Throws on a YAML error or a non-map. */
export function parseEnabled(src: string, defaults: Readonly<Enabled>, y: Yaml): Enabled {
  const doc = y.parseDocument(src);
  if (doc.errors.length) throw doc.errors[0];
  const map = doc.get("extensions");
  if (map != null && !y.isMap(map)) throw new Error("settings.yaml: 'extensions' is not a map");
  const out = { ...defaults };
  for (const id of Object.keys(defaults)) {
    const v = SWITCH[String(map?.get(id))];
    if (v !== undefined) out[id] = v;
  }
  return out;
}

const lastGood = new Map<string, { stamp: string; value: Enabled }>();

/** Which kinds `<dir>/settings.yaml` switches on; never throws. Cached by the file's mtime and size. */
export function readEnabled(dir: string, defaults: Readonly<Enabled>): Enabled {
  const file = path.join(dir, "settings.yaml");
  const last = lastGood.get(file);
  try {
    let stamp = "missing";
    try {
      const s = statSync(file);
      stamp = `${s.mtimeMs}:${s.size}`;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
    }
    if (last?.stamp === stamp) return last.value;
    if (stamp !== "missing" && !yaml) throw new Error("yaml isn't loaded");
    const value = stamp === "missing" ? { ...defaults } : parseEnabled(readFileSync(file, "utf8"), defaults, yaml!);
    lastGood.set(file, { stamp, value });
    return value;
  } catch {
    return last?.value ?? Object.fromEntries(Object.keys(defaults).map((id) => [id, true]));
  }
}
