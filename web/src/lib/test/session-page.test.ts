import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as pluginSession from "../../../../plugin/scripts/session.js";
import { applyResult, openPrompts, parseChat, permissionLine, permView, placeSteps, toolLabel, toStep, type ChatEntry } from "../chat.ts";
import { fitDesktop, frameDoc, loadSpec, renderBody } from "../mock.ts";
import {
  BEFORE,
  context,
  decisions,
  defaultOpt,
  families,
  initialView,
  parseViewHash,
  statusChip,
  type SessionDoc,
} from "../session-doc.ts";

const doc: SessionDoc = {
  slug: "demo",
  topic: "Demo",
  status: "in-progress",
  mock: { page: "existing", floor: 1280, screen: "page", currentControls: ["auth"] },
  questions: [
    {
      n: 1,
      title: "Actions?",
      status: "resolved",
      rec: "b",
      pick: "b",
      answer: "b.",
      opts: [
        { key: "a", name: "None", patch: { actions: "none" } },
        { key: "b", name: "Row", patch: { actions: "row" } },
      ],
      mock: {},
    },
    {
      n: 2,
      title: "Layout?",
      status: "open",
      rec: "a1",
      pick: null,
      opts: [
        { key: "a", name: "Grid", patch: { layout: "grid" } },
        { key: "a1", name: "Dense grid", from: "a", patch: { layout: "dense" } },
        { key: "b", name: "List", patch: { layout: "list" } },
      ],
      mock: { requires: { actions: "row", wide: true }, starts: { auth: "out" }, fixed: { tab: "x" } },
    },
  ],
};
const BASE = { actions: "none", layout: "grid" };
// JSDoc-less JS: its option defaults (`n = null`) would otherwise type n and opt as null.
const plugin = pluginSession as unknown as {
  decisions: (s: SessionDoc, base: object, o?: { today?: boolean; n?: number; opt?: string }) => object;
};

describe("decisions", () => {
  test("Today is BASE; Current adds every pick; a question adds other picks, requires, then its option", () => {
    assert.deepEqual(decisions(doc, BASE, { kind: "today" }), BASE);
    assert.deepEqual(decisions(doc, BASE, { kind: "current" }), { actions: "row", layout: "grid" });
    assert.deepEqual(decisions(doc, BASE, { kind: "q", n: 2 }, "b"), { actions: "row", layout: "list", wide: true });
    assert.deepEqual(decisions(doc, BASE, { kind: "q", n: 2 }), { actions: "row", layout: "grid", wide: true });
    assert.deepEqual(decisions(doc, BASE, { kind: "q", n: 1 }, "a"), { actions: "none", layout: "grid" });
  });

  test("matches plugin/scripts/session.js for every view", () => {
    assert.deepEqual(decisions(doc, BASE, { kind: "today" }), plugin.decisions(doc, BASE, { today: true }));
    assert.deepEqual(decisions(doc, BASE, { kind: "current" }), plugin.decisions(doc, BASE));
    for (const q of doc.questions) {
      assert.deepEqual(decisions(doc, BASE, { kind: "q", n: q.n }, BEFORE), plugin.decisions(doc, BASE, { n: q.n }));
      for (const o of q.opts ?? []) {
        assert.deepEqual(
          decisions(doc, BASE, { kind: "q", n: q.n }, o.key),
          plugin.decisions(doc, BASE, { n: q.n, opt: o.key }),
        );
      }
    }
  });
});

describe("context", () => {
  const controls = { auth: { label: "Player", items: [["in", "In"], ["out", "Out"]] as [unknown, string][], def: "in" } };
  test("defaults, starts, the user's choice, then fixed; plus phone and q", () => {
    assert.deepEqual(context(controls, doc.questions[1], {}, false), { auth: "out", tab: "x", phone: false, q: 2 });
    assert.deepEqual(context(controls, doc.questions[1], { auth: "in" }, true), { auth: "in", tab: "x", phone: true, q: 2 });
    assert.deepEqual(context(controls, null, {}, false), { auth: "in", phone: false, q: null });
  });
});

describe("question helpers", () => {
  test("defaultOpt: pick, then rec, then first", () => {
    assert.equal(defaultOpt(doc.questions[0]), "b");
    assert.equal(defaultOpt(doc.questions[1]), "a1");
    assert.equal(defaultOpt({ n: 3, title: "x", status: "open", opts: [] }), BEFORE);
  });

  test("families group variants under their root", () => {
    assert.deepEqual(
      families(doc.questions[1]).map((f) => [f.root.key, f.kids.map((k) => k.key)]),
      [["a", ["a1"]], ["b", []]],
    );
  });

  test("statusChip", () => {
    assert.equal(statusChip(doc.questions[0]).text, "✓ b · Row");
    assert.equal(statusChip({ n: 4, title: "x", status: "see", see: 2 }).text, "↪ see Q2");
    assert.equal(statusChip(doc.questions[1]).tone, "open");
  });

  test("initialView and hashes", () => {
    assert.deepEqual(initialView(doc), { kind: "q", n: 2 });
    assert.deepEqual(parseViewHash("#q-1", doc), { kind: "q", n: 1 });
    assert.equal(parseViewHash("#q-9", doc), null);
    assert.deepEqual(parseViewHash("#today", doc), { kind: "today" });
    assert.equal(parseViewHash("#today", { ...doc, mock: { ...doc.mock!, page: "new" } }), null);
  });
});

describe("mock", () => {
  const spec = `const CONTROLS = { auth: { label: 'P', items: [['in','In']], def: 'in' } };
const BASE = { n: COUNT };
function renderScreen(d, ctx) { if (d.boom) throw new Error('bad'); return '<p>' + d.n + ctx.auth + '</p>'; }
function route() { return '/x'; }`;

  test("loadSpec runs data then spec and picks out its names", () => {
    const s = loadSpec(spec, "const COUNT = 3;");
    assert.deepEqual(s.BASE, { n: 3 });
    assert.equal(s.renderScreen(s.BASE, { auth: "in" }), "<p>3in</p>");
    assert.equal(s.route?.({}, {}), "/x");
    assert.throws(() => loadSpec("const BASE = {};"), /renderScreen/);
  });

  test("renderBody shows a throw in the frame instead of failing", () => {
    const s = loadSpec(spec, "const COUNT = 1;");
    assert.match(renderBody(s, { boom: true }, {}), /renderScreen threw: bad/);
  });

  test("frameDoc puts the theme on html and the styles in order", () => {
    const html = frameDoc({ body: "<i>x</i>", theme: "dark", styles: ["a.css", 'b".css'] });
    assert.match(html, /<html lang="en" data-theme="dark" class="dark">/);
    assert.ok(html.indexOf("a.css") < html.indexOf("b&quot;.css"));
    assert.match(html, /<body><i>x<\/i><\/body>/);
  });

  test("fitDesktop scales below the floor only", () => {
    assert.deepEqual(fitDesktop(640, 1280), { width: 1280, scale: 0.5 });
    assert.deepEqual(fitDesktop(1600, 1280), { width: 1600, scale: 1 });
  });
});

describe("chat", () => {
  const lines = (es: object[]) => es.map((e) => JSON.stringify({ at: "t", ...e })).join("\n");

  test("parseChat skips junk and a torn last line", () => {
    const text = `${lines([{ from: "claude", kind: "reply", text: "hi" }, { nope: 1 }])}\n{"from":"site","ki`;
    assert.deepEqual(parseChat(text), [{ at: "t", from: "claude", kind: "reply", text: "hi" }]);
  });

  const open = (es: object[]) => {
    const o = openPrompts(parseChat(lines(es)) as ChatEntry[]);
    return { choices: [...o.choices], permissions: [...o.permissions] };
  };

  test("a choice stays open until the site answers it or the terminal moves on", () => {
    assert.deepEqual(open([{ from: "claude", kind: "choice", id: "abc123" }]).choices, ["abc123"]);
    assert.deepEqual(
      open([{ from: "claude", kind: "choice", id: "abc123" }, { from: "site", kind: "choice", id: "abc123" }]).choices,
      [],
    );
    assert.deepEqual(
      open([{ from: "claude", kind: "choice", id: "abc123" }, { from: "terminal", kind: "chat", text: "x" }]).choices,
      [],
    );
    assert.deepEqual(
      open([{ from: "claude", kind: "choice", id: "abc123" }, { from: "claude", kind: "steps", steps: [] }]).choices,
      ["abc123"],
    );
  });

  test("a permission prompt closes on a site verdict or Claude's next message", () => {
    const p = { from: "claude", kind: "permission", request_id: "abcde" };
    assert.deepEqual(open([p]).permissions, ["abcde"]);
    assert.deepEqual(open([p, { from: "site", kind: "permission", request_id: "abcde" }]).permissions, []);
    assert.deepEqual(open([p, { from: "claude", kind: "reply", text: "done" }]).permissions, []);
  });

  const order = (es: object[]) => placeSteps(es as ChatEntry[]).map((e) => `${e.from}:${e.kind}`);
  const steps = (start: string, extra: object = {}) => ({ at: "2026-10-23T10:00:30Z", from: "claude", kind: "steps", start, steps: [{ label: "Saved the session", at: start }], ms: 30000, ...extra });

  test("placeSteps moves a turn's steps above the reply logged before them", () => {
    const es = [
      { at: "2026-10-23T09:59:00Z", from: "claude", kind: "reply", text: "earlier" },
      { at: "2026-10-23T10:00:00Z", from: "site", kind: "chat", text: "go" },
      { at: "2026-10-23T10:00:20Z", from: "claude", kind: "reply", text: "done" },
      { at: "2026-10-23T10:00:25Z", from: "claude", kind: "reply", text: "and more" },
      steps("2026-10-23T10:00:01Z"),
    ];
    assert.deepEqual(order(es), ["claude:reply", "site:chat", "claude:steps", "claude:reply", "claude:reply"]);
  });

  test("placeSteps puts a terminal turn's steps after your message, above Claude's", () => {
    // log-chat writes both terminal entries late, in the turn's save; the user's prompt came first.
    const es = [
      { at: "2026-10-23T10:00:20Z", from: "terminal", kind: "chat", text: "hm" },
      { at: "2026-10-23T10:00:20Z", from: "claude", kind: "terminal", text: "ok" },
      steps("2026-10-23T10:00:00Z"),
    ];
    assert.deepEqual(order(es), ["terminal:chat", "claude:steps", "claude:terminal"]);
  });

  test("placeSteps leaves an interrupted turn with no reply where it is", () => {
    const es = [
      { at: "2026-10-23T09:59:00Z", from: "claude", kind: "reply", text: "earlier" },
      { at: "2026-10-23T10:00:00Z", from: "site", kind: "chat", text: "go" },
      steps("2026-10-23T10:00:01Z", { interrupted: true }),
      { at: "2026-10-23T10:01:00Z", from: "claude", kind: "reply", text: "next turn" },
    ];
    assert.deepEqual(order(es), ["claude:reply", "site:chat", "claude:steps", "claude:reply"]);
  });

  test("toStep keeps a step's known string parts and drops the rest", () => {
    assert.deepEqual(toStep({ label: "Ran pnpm to run tests", at: "t1", verb: "Ran", target: "pnpm", detail: "to run tests", type: "step", x: 1 }), {
      label: "Ran pnpm to run tests",
      at: "t1",
      verb: "Ran",
      target: "pnpm",
      detail: "to run tests",
    });
    assert.deepEqual(toStep({ label: "Read b/c.ts", at: "t2" }), { label: "Read b/c.ts", at: "t2" });
    assert.deepEqual(toStep({ label: "x", at: "t3", verb: 4, target: "", detail: null }), { label: "x", at: "t3" });
    assert.deepEqual(toStep(null), { label: "", at: "" });
    assert.deepEqual(toStep({ label: "Read a", at: "t4", id: "toolu_1", meta: "not found", tone: "bad" }), {
      label: "Read a",
      at: "t4",
      id: "toolu_1",
      meta: "not found",
      tone: "bad",
    });
    assert.deepEqual(toStep({ label: "x", at: "t5", meta: "0 files", tone: "red" }), { label: "x", at: "t5", meta: "0 files" });
  });

  test("applyResult sets meta and tone on the step with that id", () => {
    const turn = { start: "t0", steps: [toStep({ label: "a", at: "t1", id: "e1" }), toStep({ label: "b", at: "t2", id: "e2", tone: "warn", meta: "x" })] };
    assert.deepEqual(applyResult(turn, { type: "result", id: "e2", meta: "exit 1", tone: "bad" }).steps[1], {
      label: "b",
      at: "t2",
      id: "e2",
      meta: "exit 1",
      tone: "bad",
    });
    assert.deepEqual(applyResult(turn, { type: "result", id: "e2", meta: "done" }).steps[1], { label: "b", at: "t2", id: "e2", meta: "done" });
    assert.equal(applyResult(turn, { type: "result", id: "nope", meta: "x" }), turn);
    assert.equal(applyResult(turn, { type: "result", id: "e1" }), turn);
  });
});

describe("permission cards", () => {
  test("toolLabel", () => {
    assert.deepEqual(toolLabel("mcp__plugin_sear_sear__reply"), { label: "sear · reply", server: "sear", tool: "reply" });
    assert.deepEqual(toolLabel("mcp__claude_ai_Claude_Docs__batch"), { label: "claude_ai_Claude_Docs · batch", server: "claude_ai_Claude_Docs", tool: "batch" });
    assert.deepEqual(toolLabel("Bash"), { label: "Bash", tool: "Bash" });
  });

  test("permissionLine", () => {
    assert.equal(permissionLine("mcp__plugin_sear_sear__reply", "The only way to answer…"), "Post a message to this drawer.");
    assert.equal(permissionLine("mcp__claude_ai_Claude_Docs__batch", "Create a doc"), "");
    assert.equal(permissionLine("Bash", "List files"), "List files");
  });

  test("permView: Sear reply and choice render as Markdown", () => {
    const reply = JSON.stringify({ text: "See `C:\\Users\\Nick\\x.md`" });
    assert.ok(reply.includes("C:\\\\Users"));
    assert.deepEqual(permView("mcp__plugin_sear_sear__reply", reply), { kind: "markdown", text: "See `C:\\Users\\Nick\\x.md`" });
    assert.deepEqual(permView("mcp__plugin_sear_sear__choice", JSON.stringify({ prompt: "Which?", options: ["a", "b"] })), {
      kind: "markdown",
      text: "Which?",
      options: ["a", "b"],
    });
  });

  test("permView: Bash and Edit", () => {
    assert.deepEqual(permView("Bash", JSON.stringify({ command: "ls -la", description: "List" })), { kind: "command", command: "ls -la", description: "List" });
    assert.deepEqual(permView("Edit", JSON.stringify({ file_path: "a.ts", old_string: "x", new_string: "y" })), {
      kind: "edit",
      path: "a.ts",
      oldText: "x",
      newText: "y",
    });
  });

  test("permView: other tools as fields, junk as raw", () => {
    assert.deepEqual(permView("Write", JSON.stringify({ file_path: "a.ts", n: 2, o: { x: 1 } })), {
      kind: "fields",
      fields: [
        ["file_path", "a.ts"],
        ["n", "2"],
        ["o", '{"x":1}'],
      ],
    });
    assert.deepEqual(permView("Bash", "{not json"), { kind: "raw", text: "{not json" });
    assert.deepEqual(permView("Bash", "[1,2]"), { kind: "raw", text: "[1,2]" });
    assert.deepEqual(permView("Bash", JSON.stringify({ timeout: 5 })), { kind: "fields", fields: [["timeout", "5"]] });
  });
});
