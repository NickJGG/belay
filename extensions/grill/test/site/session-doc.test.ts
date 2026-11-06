import assert from "node:assert/strict";
import { describe, test } from "node:test";
import * as pluginSession from "../../plugin/scripts/session.js";
import { fitDesktop, frameDoc, loadSpec, renderBody } from "../../web/_lib/mock.ts";
import {
  BEFORE,
  context,
  decidedCount,
  decisions,
  defaultOpt,
  families,
  initialView,
  parseViewHash,
  statusChip,
  type SessionDoc,
} from "../../web/_lib/session-doc.ts";

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
    assert.deepEqual(parseViewHash("#overview", doc), { kind: "overview" });
    assert.deepEqual(parseViewHash("#overview", { ...doc, mock: null }), { kind: "overview" });
  });

  test("a settled grill opens on Overview", () => {
    assert.deepEqual(initialView({ ...doc, status: "planned" }), { kind: "overview" });
    assert.deepEqual(initialView({ ...doc, status: "abandoned" }), { kind: "overview" });
  });

  test("decidedCount leaves out dropped and see, keeps deferred", () => {
    const d: SessionDoc = {
      ...doc,
      questions: [
        { n: 1, title: "a", status: "resolved" },
        { n: 2, title: "b", status: "open" },
        { n: 3, title: "c", status: "deferred" },
        { n: 4, title: "d", status: "dropped" },
        { n: 5, title: "e", status: "see", see: 1 },
        { n: 6, title: "f", status: "resolved" },
      ],
    };
    assert.deepEqual(decidedCount(d), { decided: 2, total: 4, segs: ["done", "open", "deferred", "done"] });
    assert.deepEqual(decidedCount({ ...doc, questions: [] }), { decided: 0, total: 0, segs: [] });
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

  test("frameDoc leaves html's background to the body, so it paints the whole frame", () => {
    const html = frameDoc({ body: "", theme: "light", styles: [] });
    assert.doesNotMatch(html, /html\s*\{[^}]*background/);
  });

  test("fitDesktop scales below the floor only", () => {
    assert.deepEqual(fitDesktop(640, 1280), { width: 1280, scale: 0.5 });
    assert.deepEqual(fitDesktop(1600, 1280), { width: 1600, scale: 1 });
  });
});
