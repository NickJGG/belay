import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { Ctx } from "../../../../src/ops.ts";
import type { IssueStatus } from "../../../../src/store.ts";
import { issuesByGrill, stage, type Issue } from "../issues.ts";
import { fileSessions, type Project } from "../projects.ts";
import type { SessionBase } from "../sessions.ts";

type SessionSummary = SessionBase & Record<string, unknown>;

const tmp = mkdtempSync(path.join(os.tmpdir(), "belay-issues-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

function write(rel: string, text: string) {
  const file = path.join(tmp, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

const issue = (id: string, status: IssueStatus, grill?: string, project = id.replace(/-\d+$/, "")): Issue => ({
  id,
  title: `${id} title`,
  project,
  status,
  grill,
  updated: "2026-10-24T20:58",
});

const session = (slug: string, status = "planned", project?: string): SessionSummary => ({
  slug,
  topic: slug.replaceAll("-", " "),
  status,
  project,
  questions: null,
  mock: false,
  legacy: false,
});

const project = (key: string, name: string): Project => ({ key, name, status: "active", focus: false });

describe("belay's issues", () => {
  const head = (id: string, extra: string) =>
    `---\nid: ${id}\ntitle: ${id} title\nproject: ${id.replace(/-\d+$/, "")}\nblocked_by: []\nsource: user\ncreated: 2026-10-20\nupdated: 2026-10-24T20:58\n${extra}---\nbody\n`;
  write("belay/projects/.keep", "");
  write("belay/issues/kiln-10.md", head("KILN-10", "status: todo\ngrill: some-grill\n"));
  write("belay/issues/kiln-9.md", head("KILN-9", "status: done\ngrill: some-grill\n"));
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

  test("they file and stage sessions by grill", () => {
    const by = issuesByGrill(ctx.issues);
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
});

describe("fileSessions by issues", () => {
  const projects = [project("WIND", "Windfall"), project("KILN", "Kiln"), project("PIX", "Pixel Imperium")];
  const files = (sessions: SessionSummary[], issues: Issue[]) => {
    const { projects: out, unfiled } = fileSessions(sessions, projects, issuesByGrill(issues));
    const by = Object.fromEntries(
      out.map((p) => [
        p.project.key,
        { tagged: p.tagged.map((s) => s.slug), byIssues: p.byIssues.map((s) => s.slug), matched: p.matched.map((s) => s.slug) },
      ]),
    );
    return { by, unfiled: unfiled.map((s) => s.slug) };
  };

  test("an untagged session with no name match files under its issues' project", () => {
    const { by, unfiled } = files(
      [session("personal-finance-tracker")],
      ["WIND-1", "WIND-2", "WIND-3", "WIND-4"].map((id) => issue(id, "todo", "personal-finance-tracker")),
    );
    assert.deepEqual(by.WIND.byIssues, ["personal-finance-tracker"]);
    assert.deepEqual(unfiled, []);
  });

  test("a tag beats issues, and issues beat the name match", () => {
    const { by } = files(
      [session("pixel-tagged", "planned", "KILN"), session("pixel-by-issues")],
      [issue("WIND-1", "todo", "pixel-tagged"), issue("WIND-2", "todo", "pixel-by-issues")],
    );
    assert.deepEqual(by.KILN.tagged, ["pixel-tagged"]);
    assert.deepEqual(by.WIND, { tagged: [], byIssues: ["pixel-by-issues"], matched: [] });
    assert.deepEqual(by.PIX, { tagged: [], byIssues: [], matched: [] });
  });

  test("issues in a project belay doesn't know fall through to the name match", () => {
    const { by, unfiled } = files(
      [session("pixel-ghost"), session("plain")],
      [issue("NOPE-1", "todo", "pixel-ghost"), issue("NOPE-2", "todo", "plain")],
    );
    assert.deepEqual(by.PIX.matched, ["pixel-ghost"]);
    assert.deepEqual(unfiled, ["plain"]);
  });

  test("issues in several known projects file the session under each", () => {
    const { by } = files([session("both")], [issue("WIND-1", "todo", "both"), issue("KILN-1", "todo", "both")]);
    assert.deepEqual(by.WIND.byIssues, ["both"]);
    assert.deepEqual(by.KILN.byIssues, ["both"]);
  });
});
