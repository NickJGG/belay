import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { followAction, optForKey, parseRemembered, REMEMBERED_DEFAULTS, stepView, viewOrder } from "../../web/_lib/behaviours.ts";
import { viewHash, type Question, type SessionDoc } from "../../web/_lib/session-doc.ts";

const q: Question = {
  n: 3,
  title: "Layout?",
  status: "open",
  rec: "b",
  opts: [
    { key: "a", name: "Stack" },
    { key: "a1", name: "Stack, tight", from: "a" },
    { key: "a2", name: "Stack, grey", from: "a1", yours: true },
    { key: "b", name: "Grid" },
  ],
};

const doc: SessionDoc = {
  slug: "demo",
  topic: "Demo",
  status: "in-progress",
  mock: { page: "existing", floor: 1280, screen: "page" },
  questions: [q, { n: 4, title: "Colour?", status: "open" }],
};

describe("optForKey", () => {
  test("a letter selects its option", () => {
    assert.equal(optForKey(q, "b", "a"), "b");
    assert.equal(optForKey(q, "a", "b"), "a");
  });
  test("pressed again, it cycles through the family and wraps", () => {
    assert.equal(optForKey(q, "a", "a"), "a1");
    assert.equal(optForKey(q, "a", "a1"), "a2");
    assert.equal(optForKey(q, "a", "a2"), "a");
  });
  test("a letter with no option selects nothing", () => {
    assert.equal(optForKey(q, "z", "a"), null);
  });
});

describe("stepView", () => {
  test("rail order is Current, Today, then the questions", () => {
    assert.deepEqual(viewOrder(doc).map(viewHash), ["#current", "#today", "#q-3", "#q-4"]);
  });
  test("steps both ways and stops at the ends", () => {
    assert.equal(viewHash(stepView(doc, { kind: "q", n: 3 }, 1)!), "#q-4");
    assert.equal(viewHash(stepView(doc, { kind: "q", n: 3 }, -1)!), "#today");
    assert.equal(stepView(doc, { kind: "q", n: 4 }, 1), null);
    assert.equal(stepView(doc, { kind: "current" }, -1), null);
  });
  test("a new page has no Today", () => {
    const fresh = { ...doc, mock: { ...doc.mock!, page: "new" as const } };
    assert.equal(viewHash(stepView(fresh, { kind: "current" }, 1)!), "#q-3");
  });
});

describe("followAction", () => {
  test("jumps when the user is where follow along left them", () => {
    assert.equal(followAction("#q-3", "#q-3", "#q-4"), "jump");
  });
  test("offers a pill when the user wandered", () => {
    assert.equal(followAction("#q-1", "#q-3", "#q-4"), "pill");
  });
  test("already there", () => {
    assert.equal(followAction("#q-4", "#q-1", "#q-4"), "here");
  });
});

describe("parseRemembered", () => {
  test("missing or junk gives the defaults", () => {
    assert.deepEqual(parseRemembered(null), REMEMBERED_DEFAULTS);
    assert.deepEqual(parseRemembered("{oops"), REMEMBERED_DEFAULTS);
    assert.deepEqual(parseRemembered("[1]"), REMEMBERED_DEFAULTS);
  });
  test("keeps valid fields, drops bad ones, clamps sizes", () => {
    const r = parseRemembered(
      JSON.stringify({
        states: { "#q-3": { opt: "a1", vs: "b", ctl: { auth: true } }, "#evil": { opt: "x" }, "#current": { opt: 5, ctl: [] } },
        device: "phone",
        compare: true,
        drawerOpen: "no",
        drawerW: 9999,
        split: 0.01,
      }),
    );
    assert.deepEqual(r, {
      states: { "#q-3": { opt: "a1", vs: "b", ctl: { auth: true } }, "#current": { ctl: {} } },
      device: "phone",
      compare: true,
      drawerOpen: true,
      drawerW: 760,
      split: 0.15,
    });
  });
});
