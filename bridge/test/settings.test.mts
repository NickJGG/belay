/** The bridge's settings reader against the CLI's (`src/extensions.ts`), and its kinds and defaults against the installed extensions. */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import * as yaml from "yaml";
import { installedIds } from "../../src/extension-ids.ts";
import { parseEnabled as coreParse } from "../../src/extensions.ts";
import { findClone, installedIn } from "../extensions.mts";
import { DEFAULTS, KINDS } from "../kinds/index.mts";
import { loadYaml, parseEnabled, readEnabled } from "../settings.mts";

const dir = mkdtempSync(path.join(os.tmpdir(), "belay-bridge-settings-"));
after(() => rmSync(dir, { recursive: true, force: true }));

test("the bridge's kinds are the installed extensions, with the CLI's defaults", () => {
  assert.deepEqual(KINDS.map((k) => k.id), installedIds());
  assert.deepEqual(DEFAULTS, coreParse(""));
});

test("the clone is BELAY_REPO, else the folder above bridge/, else the belay marketplace's directory", () => {
  const repo = path.resolve(import.meta.dirname, "..", "..");
  const home = path.join(dir, "home");
  const clone = path.join(dir, "clone");
  mkdirSync(path.join(clone, "extensions", "demo"), { recursive: true });
  mkdirSync(path.join(clone, "src"), { recursive: true });
  writeFileSync(path.join(clone, "src", "extension-ids.ts"), "");
  writeFileSync(path.join(clone, "extensions", "demo", "belay.json"), "{}");
  mkdirSync(path.join(home, ".claude", "plugins"), { recursive: true });
  writeFileSync(path.join(home, ".claude", "plugins", "known_marketplaces.json"), JSON.stringify({ belay: { source: { source: "directory", path: clone } } }));

  assert.deepEqual(findClone({ BELAY_REPO: clone }, home), { root: clone });
  assert.deepEqual(findClone({}, home), { root: repo });
  assert.deepEqual(findClone({ BELAY_REPO: path.join(dir, "nowhere") }, home), { root: repo });
  const cache = path.join(dir, "cache", "belay", "0.5.0", "bridge");
  assert.deepEqual(findClone({}, home, cache), { root: clone });
  assert.match((findClone({}, path.join(dir, "nohome"), cache) as { why: string }).why, /^no Belay clone at /);
  assert.deepEqual(installedIn(repo), installedIds());
  assert.deepEqual(installedIn(clone), ["demo"]);
  writeFileSync(path.join(clone, "extensions", "installed.json"), JSON.stringify({ installed: [] }));
  assert.deepEqual(installedIn(clone), []);
  writeFileSync(path.join(clone, "extensions", "installed.json"), "{}");
  assert.throws(() => installedIn(clone), /expected/);
});

const CASES = [
  "",
  "accent: blue\ntheme: dark\n",
  "extensions:\n  learn: on\n",
  "extensions: { learn: off, grill: off }\n",
  "extensions:\n  learn: true\n  grill: false\n",
  "extensions:\n  learn: 'on'\n  grill: \"off\"\n",
  "extensions:\n  learn: yes\n  grill: 1\n",
  "extensions:\n  other: on\n",
  "extensions:\n",
  "extensions: null\n",
  "extensions: [learn]\n",
  "extensions: on\n",
  "extensions:\n  learn: on\n  learn: off\n",
  "extensions: {learn: on\n",
  "# comment\nextensions: # trailing\n  learn: on # why\n",
];

test("parses every settings file as the CLI does, throwing where it throws", () => {
  for (const src of CASES) {
    let core: unknown;
    let ours: unknown;
    try {
      core = coreParse(src);
    } catch {
      core = "throws";
    }
    try {
      ours = parseEnabled(src, DEFAULTS, yaml);
    } catch {
      ours = "throws";
    }
    assert.deepEqual(ours, core, JSON.stringify(src));
  }
});

test("reads the file with the defaults when it's missing, the last good value when it breaks, and all on before any", async () => {
  await loadYaml(() => {});
  const fresh = path.join(dir, "fresh");
  assert.deepEqual(readEnabled(fresh, DEFAULTS), DEFAULTS);

  const broken = path.join(dir, "broken");
  const file = (d: string) => path.join(d, "settings.yaml");
  mkdirSync(broken);
  writeFileSync(file(broken), "extensions: {learn: on\n");
  assert.deepEqual(readEnabled(broken, DEFAULTS), { grill: true, learn: true });

  const good = path.join(dir, "good");
  mkdirSync(good);
  writeFileSync(file(good), "extensions:\n  learn: on\n  grill: off\n");
  assert.deepEqual(readEnabled(good, DEFAULTS), { grill: false, learn: true });
  writeFileSync(file(good), "extensions: [\n");
  assert.deepEqual(readEnabled(good, DEFAULTS), { grill: false, learn: true });
});
