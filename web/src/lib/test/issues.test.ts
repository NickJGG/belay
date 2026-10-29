import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { Ctx } from "../../../../src/ops.ts";

const tmp = mkdtempSync(path.join(os.tmpdir(), "belay-issues-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

function write(rel: string, text: string) {
  const file = path.join(tmp, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

describe("belay's issues", () => {
  const head = (id: string, extra: string) =>
    `---\nid: ${id}\ntitle: ${id} title\nproject: ${id.replace(/-\d+$/, "")}\nblocked_by: []\nsource: user\ncreated: 2026-10-20\nupdated: 2026-10-24T20:58\n${extra}---\nbody\n`;
  write("belay/projects/.keep", "");
  write("belay/issues/kiln-10.md", head("KILN-10", "status: todo\n"));
  write("belay/issues/kiln-9.md", head("KILN-9", "status: done\n"));
  write("belay/issues/bel-2.md", head("BEL-2", "status: idea\n"));
  write("belay/issues/no-id.md", `---\ntitle: Nothing\n---\n`);
  write("belay/issues/notes.txt", "ignored");
  const ctx = new Ctx(path.join(tmp, "belay"), { lenient: true });

  test("a lenient Ctx gives the good issues in belay's id order (numeric within a key) and skips bad files", () => {
    assert.deepEqual(
      ctx.issues.map((i) => i.id),
      ["BEL-2", "KILN-9", "KILN-10"],
    );
    assert.deepEqual(ctx.bad.map((b) => b.file), ["issues/no-id.md"]);
  });
});
