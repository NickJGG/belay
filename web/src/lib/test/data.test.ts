import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, describe, test } from "node:test";
import { shortDate } from "../format.ts";
import { frontmatterList, parseFrontmatter } from "../frontmatter.ts";
import { Ctx } from "../../../../src/ops.ts";
import { fileSessions, projectsOf, projectTerms, resolveIcon } from "../projects.ts";
import { byUpdated, listSessions, type SessionMemo, type SessionSummary } from "../sessions.ts";

const tmp = mkdtempSync(path.join(os.tmpdir(), "sear-site-"));
after(() => rmSync(tmp, { recursive: true, force: true }));

function write(rel: string, text: string) {
  const file = path.join(tmp, rel);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

const md = (fields: Record<string, string>) =>
  `---\n${Object.entries(fields)
    .map(([k, v]) => `${k}: ${v}`)
    .join("\n")}\n---\n\n# Grill session\n`;

describe("parseFrontmatter", () => {
  test("reads plain, double- and single-quoted scalars and skips lists", () => {
    const { data, body } = parseFrontmatter(
      `---\nkey: SEAR\ntopic: "A: quoted \\"one\\""\nname: 'It''s'\npaths:\n  - C:/x\nfocus: false # c\n---\nbody`,
    );
    assert.deepEqual(data, { key: "SEAR", topic: 'A: quoted "one"', name: "It's", focus: "false" });
    assert.equal(body, "body");
  });

  test("no frontmatter leaves the text as body", () => {
    assert.deepEqual(parseFrontmatter("# hi"), { data: {}, body: "# hi" });
  });
});

describe("frontmatterList", () => {
  test("reads a top-level block list, quoted items included, and stops at the next key", () => {
    const text = `---\nkey: BEL\npaths:\n  - C:/Users/x/belay\n  - "C:/two words"\nstatus: active\n---\n`;
    assert.deepEqual(frontmatterList(text, "paths"), ["C:/Users/x/belay", "C:/two words"]);
  });

  test("absent, scalar or empty lists give []", () => {
    assert.deepEqual(frontmatterList("---\nkey: X\n---\n", "paths"), []);
    assert.deepEqual(frontmatterList("---\npaths: C:/x\n---\n", "paths"), []);
    assert.deepEqual(frontmatterList("---\npaths:\nkey: X\n---\n", "paths"), []);
    assert.deepEqual(frontmatterList("no frontmatter", "paths"), []);
  });
});

describe("resolveIcon", () => {
  const repo = path.join(tmp, "repo");
  write("repo/42/icon.png", "png");
  write("repo/public/favicon.svg", "<svg/>");
  write("repo/favicon.ico", "ico");
  write("repo/notes.txt", "txt");

  test("the icon field, relative to the first path or absolute", () => {
    assert.equal(resolveIcon("42/icon.png", repo), path.join(repo, "42", "icon.png"));
    assert.equal(resolveIcon(path.join(repo, "favicon.ico"), undefined), path.join(repo, "favicon.ico"));
  });

  test("a set field that misses doesn't fall back to discovery", () => {
    assert.equal(resolveIcon("nope.svg", repo), undefined);
    assert.equal(resolveIcon("42/icon.png", undefined), undefined);
  });

  test("without the field, the first candidate present in the repo", () => {
    assert.equal(resolveIcon(undefined, repo), path.join(repo, "public", "favicon.svg"));
    write("repo/app/icon.svg", "<svg/>");
    assert.equal(resolveIcon(undefined, repo), path.join(repo, "app", "icon.svg"));
    assert.equal(resolveIcon(undefined, path.join(tmp, "empty-repo")), undefined);
    assert.equal(resolveIcon(undefined, undefined), undefined);
  });

  test("only .svg, .png and .ico", () => {
    assert.equal(resolveIcon("notes.txt", repo), undefined);
  });
});

describe("listSessions", () => {
  const sear = path.join(tmp, "sear");
  const grill = path.join(tmp, "grill");
  write(
    "sear/new-one/session.json",
    JSON.stringify({
      slug: "new-one",
      topic: "New",
      status: "in-progress",
      project: "sear",
      started: "2026-10-20",
      updated: "2026-10-23",
      open: "Q2 next",
      mock: { page: "new" },
      questions: [
        { n: 1, title: "First?", short: "First", status: "resolved" },
        { n: 2, title: "Second?", status: "weird" },
      ],
    }),
  );
  write("sear/md-only/md-only.md", md({ slug: "md-only", topic: '"Rendered"', status: "planned", started: "2026-10-01" }));
  write("sear/fresh/bridge.json", "{}");
  write("sear/broken/session.json", "{not json");
  write("sear/Not-A-Slug/session.json", "{}");
  write("grill/old-one/old-one.md", md({ topic: "Old grill", status: "abandoned", project: "TOPO", updated: "2026-09-01" }));
  write("grill/md-only/md-only.md", md({ topic: "Shadowed" }));
  write("grill/no-file/preview.html", "");
  const roots = [
    { dir: sear, source: "sear" as const },
    { dir: grill, source: "grill" as const },
  ];

  test("reads session.json, markdown and bare bridge.json folders; the first root wins", () => {
    const bySlug = new Map(listSessions(roots).map((s) => [s.slug, s]));
    assert.deepEqual([...bySlug.keys()].sort(), ["fresh", "md-only", "new-one", "old-one"]);

    const n = bySlug.get("new-one")!;
    assert.equal(n.project, "SEAR");
    assert.equal(n.open, "Q2 next");
    assert.equal(n.mock, true);
    assert.deepEqual(n.questions, [
      { n: 1, title: "First?", short: "First", status: "resolved" },
      { n: 2, title: "Second?", short: "Second?", status: "open" },
    ]);

    const m = bySlug.get("md-only")!;
    assert.equal(m.topic, "Rendered");
    assert.equal(m.source, "sear");
    assert.equal(m.updated, "2026-10-01");
    assert.equal(m.questions, null);

    assert.deepEqual(bySlug.get("fresh"), {
      slug: "fresh",
      topic: "fresh",
      status: "in-progress",
      questions: [],
      mock: false,
      source: "sear",
    });
    assert.equal(bySlug.get("old-one")!.source, "grill");
  });

  test("the memo reuses a parse until the file's mtime changes", () => {
    const memo: SessionMemo = new Map();
    const first = listSessions(roots, memo).find((s) => s.slug === "old-one");
    assert.equal(listSessions(roots, memo).find((s) => s.slug === "old-one"), first);
  });

  test("byUpdated puts the newest first", () => {
    assert.deepEqual(
      listSessions(roots)
        .sort(byUpdated)
        .map((s) => s.slug),
      ["new-one", "md-only", "old-one", "fresh"],
    );
  });
});

describe("projects", () => {
  const belay = path.join(tmp, "belay");
  write("belay/projects/topo.md", md({ key: "TOPO", name: "Topo", status: "active", group: "Websites" }));
  write("belay/projects/pix.md", md({ key: "PIX", name: "Pixel Imperium", status: "active", focus: "true" }));
  write("belay/projects/cld.md", md({ key: "CLD", name: "Claude config", status: "active" }));
  write("belay/projects/elv.md", md({ key: "ELV", name: "Rideable Elevators", status: "paused", group: "PZ Mods" }));
  write("belay/issues/.keep", "");
  write("belay-icons/issues/.keep", "");
  write("belay/order.yaml", "project_order:\n  - ELV\n  - CLD\n  - PIX\nother: 1\n");

  test("projectsOf resolves each project's icon against its first path", () => {
    write("belay-icons/projects/bel.md", `---\nkey: BEL\nname: Belay\npaths:\n  - ${tmp.replaceAll("\\", "/")}/repo\nicon: 42/icon.png\n---\n`);
    write("belay-icons/projects/topo.md", md({ key: "TOPO", name: "Topo" }));
    const by = Object.fromEntries(projectsOf(new Ctx(path.join(tmp, "belay-icons"), { lenient: true })).map((p) => [p.key, p.icon]));
    assert.equal(by.BEL, path.join(tmp, "repo", "42", "icon.png"));
    assert.equal(by.TOPO, undefined);
  });

  test("projectsOf orders focused, then ungrouped, then groups, each by the manual order", () => {
    assert.deepEqual(
      projectsOf(new Ctx(belay, { lenient: true })).map((p) => p.key),
      ["PIX", "CLD", "ELV", "TOPO"],
    );
  });

  test("projectTerms keeps 5+ letter words, singularized", () => {
    assert.deepEqual(projectTerms({ key: "ELV", name: "Rideable Elevators", status: "active", focus: false }), [
      "rideable",
      "elevator",
    ]);
  });

  test("fileSessions files tagged and fuzzy-matched sessions; the rest are unfiled", () => {
    const s = (slug: string, topic: string, project?: string): SessionSummary => ({
      slug,
      topic,
      status: "in-progress",
      project,
      questions: null,
      mock: false,
      source: "grill",
    });
    const sessions = [
      s("pz-buildable-elevators", "Elevators you can build"),
      s("claude-hooks", "Hooks", "CLD"),
      s("misc", "Something else"),
      s("ghost", "Tagged with an unknown key", "NOPE"),
      s("pixel-tiles", "Mentions pixels but is tagged", "TOPO"),
    ];
    const { projects, unfiled } = fileSessions(sessions, projectsOf(new Ctx(belay, { lenient: true })));
    const by = Object.fromEntries(projects.map((p) => [p.project.key, p]));
    assert.deepEqual(by.ELV.matched.map((x) => x.slug), ["pz-buildable-elevators"]);
    assert.deepEqual(by.CLD.tagged.map((x) => x.slug), ["claude-hooks"]);
    assert.deepEqual(by.PIX.matched, []);
    assert.deepEqual(by.TOPO.tagged.map((x) => x.slug), ["pixel-tiles"]);
    assert.deepEqual(unfiled.map((x) => x.slug), ["misc", "ghost"]);
  });
});

describe("shortDate", () => {
  const now = new Date(2026, 9, 23, 15);
  test("today, yesterday, this year, other years", () => {
    assert.equal(shortDate("2026-10-23", now), "today");
    assert.equal(shortDate("2026-10-22T09:00", now), "yesterday");
    assert.equal(shortDate("2026-10-05", now), "Oct 5");
    assert.equal(shortDate("2025-01-09", now), "Jan 9, 2025");
    assert.equal(shortDate(undefined, now), "");
  });
});
