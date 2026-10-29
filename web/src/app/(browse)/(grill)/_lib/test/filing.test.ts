import assert from "node:assert/strict";
import { describe, test } from "node:test";
import type { IssueStatus } from "../../../../../../../src/store.ts";
import type { Issue } from "../../../../../lib/issues.ts";
import type { Project } from "../../../../../lib/projects.ts";
import type { SessionBase } from "../../../../../lib/sessions.ts";
import { fileSessions, projectOf, projectTerms } from "../filing.ts";
import { issuesByGrill } from "../issues.ts";

const project = (key: string, name: string): Project => ({ key, name, status: "active", focus: false });

const session = (slug: string, topic = slug.replaceAll("-", " "), project?: string): SessionBase => ({ slug, topic, status: "planned", project });

const issue = (id: string, grill: string, status: IssueStatus = "todo"): Issue => ({
  id,
  title: `${id} title`,
  project: id.replace(/-\d+$/, ""),
  status,
  extra: [{ key: "grill", value: grill, after: "source" }],
  updated: "2026-10-24T20:58",
});

test("projectTerms keeps 5+ letter words, singularized", () => {
  assert.deepEqual(projectTerms(project("ELV", "Rideable Elevators")), ["rideable", "elevator"]);
});

test("fileSessions files tagged and fuzzy-matched sessions; the rest are unfiled", () => {
  // In `belay project list` order.
  const projects = [project("PIX", "Pixel Imperium"), project("CLD", "Claude config"), project("ELV", "Rideable Elevators"), project("MAPS", "Maps")];
  const sessions = [
    session("pz-buildable-elevators", "Elevators you can build"),
    session("claude-hooks", "Hooks", "CLD"),
    session("misc", "Something else"),
    session("ghost", "Tagged with an unknown key", "NOPE"),
    session("pixel-tiles", "Mentions pixels but is tagged", "MAPS"),
  ];
  const { projects: out, unfiled } = fileSessions(sessions, projects);
  const by = Object.fromEntries(out.map((p) => [p.project.key, p]));
  assert.deepEqual(by.ELV.matched.map((x) => x.slug), ["pz-buildable-elevators"]);
  assert.deepEqual(by.CLD.tagged.map((x) => x.slug), ["claude-hooks"]);
  assert.deepEqual(by.PIX.matched, []);
  assert.deepEqual(by.MAPS.tagged.map((x) => x.slug), ["pixel-tiles"]);
  assert.deepEqual(unfiled.map((x) => x.slug), ["misc", "ghost"]);
});

describe("fileSessions by issues", () => {
  const projects = [project("WIND", "Windfall"), project("KILN", "Kiln"), project("PIX", "Pixel Imperium")];
  const files = (sessions: SessionBase[], issues: Issue[]) => {
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
      ["WIND-1", "WIND-2", "WIND-3", "WIND-4"].map((id) => issue(id, "personal-finance-tracker")),
    );
    assert.deepEqual(by.WIND.byIssues, ["personal-finance-tracker"]);
    assert.deepEqual(unfiled, []);
  });

  test("a tag beats issues, and issues beat the name match", () => {
    const { by } = files(
      [session("pixel-tagged", undefined, "KILN"), session("pixel-by-issues")],
      [issue("WIND-1", "pixel-tagged"), issue("WIND-2", "pixel-by-issues")],
    );
    assert.deepEqual(by.KILN.tagged, ["pixel-tagged"]);
    assert.deepEqual(by.WIND, { tagged: [], byIssues: ["pixel-by-issues"], matched: [] });
    assert.deepEqual(by.PIX, { tagged: [], byIssues: [], matched: [] });
  });

  test("issues in a project belay doesn't know fall through to the name match", () => {
    const { by, unfiled } = files([session("pixel-ghost"), session("plain")], [issue("NOPE-1", "pixel-ghost"), issue("NOPE-2", "plain")]);
    assert.deepEqual(by.PIX.matched, ["pixel-ghost"]);
    assert.deepEqual(unfiled, ["plain"]);
  });

  test("issues in several known projects file the session under each", () => {
    const { by } = files([session("both")], [issue("WIND-1", "both"), issue("KILN-1", "both")]);
    assert.deepEqual(by.WIND.byIssues, ["both"]);
    assert.deepEqual(by.KILN.byIssues, ["both"]);
  });
});

test("projectOf gives each filed session the first project, in project order, that files it", () => {
  const projects = [project("WIND", "Windfall"), project("PIX", "Pixel Imperium")];
  const by = projectOf([session("both"), session("pixel-thing"), session("plain")], projects, issuesByGrill([issue("WIND-1", "both"), issue("PIX-1", "both")]));
  assert.deepEqual(Object.fromEntries([...by].map(([slug, p]) => [slug, p.key])), { both: "WIND", "pixel-thing": "PIX" });
});
