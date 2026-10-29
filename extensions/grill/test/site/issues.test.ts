import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { Ctx } from "../../../../src/ops.ts";
import type { IssueStatus } from "../../../../src/store.ts";
import type { Issue } from "../../../../web/src/lib/issues.ts";
import type { SessionBase } from "../../../../web/src/lib/sessions.ts";
import { byGrillOf, grillProgress, issuesByGrill, stage } from "../../web/_lib/issues.ts";

const tmp = mkdtempSync(path.join(os.tmpdir(), "belay-grill-issues-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

function write(rel: string, text: string) {
  const file = path.join(tmp, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

const issue = (id: string, status: IssueStatus, grill?: string): Issue => ({
  id,
  title: `${id} title`,
  project: id.replace(/-\d+$/, ""),
  status,
  ...(grill && { extra: [{ key: "grill", value: grill, after: "source" }] }),
  updated: "2026-10-24T20:58",
});

const session = (slug: string, status = "planned"): SessionBase => ({ slug, topic: slug, status });

describe("issues by grill", () => {
  test("belay's issues file and stage sessions by grill", () => {
    const head = (id: string, extra: string) =>
      `---\nid: ${id}\ntitle: ${id} title\nproject: ${id.replace(/-\d+$/, "")}\nblocked_by: []\nsource: user\ncreated: 2026-10-20\nupdated: 2026-10-24T20:58\n${extra}---\nbody\n`;
    write("belay/projects/.keep", "");
    write("belay/issues/kiln-10.md", head("KILN-10", "status: todo\ngrill: some-grill\n"));
    write("belay/issues/kiln-9.md", head("KILN-9", "status: done\ngrill: some-grill\n"));
    write("belay/issues/bel-2.md", head("BEL-2", "status: idea\n"));
    const by = issuesByGrill(new Ctx(path.join(tmp, "belay"), { lenient: true }).issues);
    assert.deepEqual(
      by.get("some-grill")!.map((i) => i.id),
      ["KILN-9", "KILN-10"],
    );
    assert.equal(stage(session("some-grill"), by.get("some-grill")!), "building");
  });

  test("issuesByGrill groups by slug in id order and skips issues without one", () => {
    const by = issuesByGrill([issue("A-10", "todo", "g"), issue("A-2", "done", "g"), issue("A-3", "todo")]);
    assert.deepEqual([...by.keys()], ["g"]);
    assert.deepEqual(
      by.get("g")!.map((i) => i.id),
      ["A-2", "A-10"],
    );
  });

  test("byGrillOf groups each list once, and a new list afresh", () => {
    const issues = [issue("A-1", "todo", "g")];
    assert.equal(byGrillOf(issues), byGrillOf(issues));
    assert.deepEqual(byGrillOf(issues).get("g")?.map((i) => i.id), ["A-1"]);
    assert.notEqual(byGrillOf([...issues]), byGrillOf(issues));
  });
});

describe("stage", () => {
  test("in progress is grilling, whatever its issues", () => {
    assert.equal(stage(session("s", "in-progress"), []), "grilling");
    assert.equal(stage(session("s", "in-progress"), [issue("A-1", "todo")]), "grilling");
  });

  test("planned with no issues, or every issue done or dropped, is shipped", () => {
    assert.equal(stage(session("s"), []), "shipped");
    assert.equal(stage(session("s"), [issue("A-1", "dropped"), issue("A-2", "dropped")]), "shipped");
    assert.equal(stage(session("s"), [issue("A-1", "done"), issue("A-2", "dropped")]), "shipped");
  });

  test("planned with any open issue is building", () => {
    assert.equal(stage(session("s"), [issue("A-1", "done"), issue("A-2", "idea")]), "building");
    assert.equal(stage(session("s"), [issue("A-1", "dropped"), issue("A-2", "doing")]), "building");
  });

  test("abandoned is shipped even with open issues", () => {
    assert.equal(stage(session("s", "abandoned"), [issue("A-1", "todo")]), "shipped");
  });

  test("only a building grill with issues shows its progress", () => {
    assert.equal(grillProgress({ stage: "building", progress: { done: 1, total: 3 } }), "1/3");
    assert.equal(grillProgress({ stage: "building" }), undefined);
    assert.equal(grillProgress({ stage: "shipped", progress: { done: 3, total: 3 } }), undefined);
    assert.equal(grillProgress({ stage: "grilling" }), undefined);
  });
});
