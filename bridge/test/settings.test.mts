/** The bridge's settings reader against the CLI's (`src/extensions.ts`), and its built-in list against `src/extension-ids.ts`. */
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import * as yaml from "yaml";
import { BUILT_IN as CORE_BUILT_IN, EXTENSION_IDS } from "../../src/extension-ids.ts";
import { parseEnabled as coreParse } from "../../src/extensions.ts";
import { BUILT_IN, KINDS } from "../kinds/index.mts";
import { loadYaml, parseEnabled, readEnabled } from "../settings.mts";

const dir = mkdtempSync(path.join(os.tmpdir(), "belay-bridge-settings-"));
after(() => rmSync(dir, { recursive: true, force: true }));

test("the bridge's kinds are the built-in extensions, with the same defaults", () => {
  assert.deepEqual(KINDS.map((k) => k.id), [...EXTENSION_IDS]);
  assert.deepEqual(BUILT_IN, CORE_BUILT_IN);
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
      ours = parseEnabled(src, BUILT_IN, yaml);
    } catch {
      ours = "throws";
    }
    assert.deepEqual(ours, core, JSON.stringify(src));
  }
});

test("reads the file with the defaults when it's missing, the last good value when it breaks, and all on before any", async () => {
  await loadYaml(() => {});
  const fresh = path.join(dir, "fresh");
  assert.deepEqual(readEnabled(fresh, BUILT_IN), BUILT_IN);

  const broken = path.join(dir, "broken");
  const file = (d: string) => path.join(d, "settings.yaml");
  mkdirSync(broken);
  writeFileSync(file(broken), "extensions: {learn: on\n");
  assert.deepEqual(readEnabled(broken, BUILT_IN), { grill: true, learn: true });

  const good = path.join(dir, "good");
  mkdirSync(good);
  writeFileSync(file(good), "extensions:\n  learn: on\n  grill: off\n");
  assert.deepEqual(readEnabled(good, BUILT_IN), { grill: false, learn: true });
  writeFileSync(file(good), "extensions: [\n");
  assert.deepEqual(readEnabled(good, BUILT_IN), { grill: false, learn: true });
});
