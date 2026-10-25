import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { watch } from "chokidar";
import { grillIgnored, locate, searIgnored } from "../watch-paths.ts";

const tmp = mkdtempSync(path.join(os.tmpdir(), "sear-watch-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

const slash = (p: string) => p.replaceAll("\\", "/");

test("paths match whichever separator chokidar uses", () => {
  const root = path.join(tmp, "root");
  for (const form of [(p: string) => p, slash]) {
    assert.equal(searIgnored(root)(form(root)), false);
    assert.equal(searIgnored(root)(form(path.join(root, "a-slug", "bridge.json"))), false);
    assert.equal(searIgnored(root)(form(path.join(root, "a-slug", "deep", "x"))), true);
    assert.equal(searIgnored(root)(form(path.join(root, "Not_A_Slug"))), true);
    assert.equal(grillIgnored(root)(form(root)), false);
    assert.deepEqual(locate(root, form(path.join(root, "a-slug", "chat.jsonl"))), ["a-slug", "chat.jsonl"]);
    assert.deepEqual(locate(root, form(path.join(root, "a-slug"))), ["a-slug", ""]);
  }
  const file = { isFile: () => true };
  assert.equal(grillIgnored(root)(path.join(root, "s", "s.md"), file), false);
  assert.equal(grillIgnored(root)(path.join(root, "s", "preview.html"), file), true);
});

test("a session folder created after the watcher starts reports its bridge.json", async () => {
  const root = path.join(tmp, "live");
  mkdirSync(root);
  const w = watch(root, { ignoreInitial: true, depth: 1, ignored: searIgnored(root) });
  try {
    await new Promise<void>((r) => w.on("ready", () => r()));
    const seen = new Promise<[string, string] | null>((resolve, reject) => {
      const t = setTimeout(() => reject(new Error("no event for bridge.json")), 3000);
      w.on("add", (p) => {
        const hit = locate(root, p);
        if (hit?.[1] === "bridge.json") {
          clearTimeout(t);
          resolve(hit);
        }
      });
    });
    mkdirSync(path.join(root, "new-slug"));
    writeFileSync(path.join(root, "new-slug", "bridge.json"), "{}");
    assert.deepEqual(await seen, ["new-slug", "bridge.json"]);
  } finally {
    await w.close();
  }
});
