import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, test } from "node:test";
import { kind as review } from "../../bridge/review.mts";
import { runtime } from "../../bridge/review.runtime.mts";
import { parseMessage, toChannel } from "../../../../bridge/protocol.mts";
import { stepLabel } from "../../../../bridge/transcript.mts";

const data = mkdtempSync(path.join(os.tmpdir(), "belay-review-bridge-"));
process.env.BELAY_DATA = data;
after(() => rmSync(data, { recursive: true, force: true }));

const parse = parseMessage(runtime.messages);
const ok = (m: object) => assert.ok(parse(JSON.stringify(m)), JSON.stringify(m));
const bad = (m: unknown) => assert.equal(parse(JSON.stringify(m)), null);
const channel = (m: { kind: string; slug: string }) => toChannel(m, ".", runtime.head(m.slug, { id: m.slug }), runtime.format);
const ID = "review-20261104-1405-last-commit";

test("review messages parse", () => {
  ok({ kind: "decide", slug: ID, n: [1, 3], decision: "fix" });
  ok({ kind: "decide", slug: ID, n: [2], decision: "clear" });
  ok({ kind: "track", slug: ID, n: 2 });
  ok({ kind: "track", slug: ID, n: 2, issue: "BEL-140" });
  ok({ kind: "ask", slug: ID, n: 4 });
  ok({ kind: "ask", slug: ID, n: 4, question: "why here?" });
  for (const kind of ["investigate", "tests"]) ok({ kind, slug: ID, n: 1 });
  for (const kind of ["apply", "rerun", "stop"]) ok({ kind, slug: ID });
  bad({ kind: "decide", slug: ID, n: [], decision: "fix" });
  bad({ kind: "decide", slug: ID, n: [0], decision: "fix" });
  bad({ kind: "decide", slug: ID, n: [1], decision: "track" });
  bad({ kind: "decide", slug: ID, n: 1, decision: "fix" });
  bad({ kind: "track", slug: ID, n: 1, issue: "bel 1" });
  bad({ kind: "ask", slug: ID, n: 1, question: "" });
  bad({ kind: "investigate", slug: ID, n: 1.5 });
  bad({ kind: "apply", slug: "../x" });
});

test("channel content names the review; meta carries the findings and decision", () => {
  const d = channel({ kind: "decide", slug: ID, n: [1, 3], decision: "fix" } as never);
  assert.equal(d.content, `Belay site, review \`${ID}\`: queued fix for #1, #3. Already saved; nothing to run until they apply.`);
  assert.deepEqual(d.meta, { slug: ID, kind: "decide", n: "1 3", decision: "fix" });
  assert.match(channel({ kind: "decide", slug: ID, n: [2], decision: "clear" } as never).content, /cleared the decision on #2\./);

  const t = channel({ kind: "track", slug: ID, n: 2, issue: "BEL-140" } as never);
  assert.match(t.content, /tracked #2 as BEL-140\. Already saved\.$/);
  assert.deepEqual(t.meta, { slug: ID, kind: "track", n: "2", issue: "BEL-140" });

  assert.match(channel({ kind: "ask", slug: ID, n: 4, question: "why here?" } as never).content, /: ask #4\.\n\nwhy here\?$/);
  assert.match(channel({ kind: "investigate", slug: ID, n: 5 } as never).content, /: investigate #5\.$/);
  assert.match(channel({ kind: "tests", slug: ID, n: 5 } as never).content, /: tests #5\.$/);
  assert.match(channel({ kind: "apply", slug: ID } as never).content, /: apply the queued fixes\.$/);
  assert.match(channel({ kind: "rerun", slug: ID } as never).content, /: re-run the review\.$/);
  assert.deepEqual(channel({ kind: "stop", slug: ID } as never).meta, { slug: ID, kind: "stop" });
});

test("attach takes the id of a saved review; the page and reattach advice name it", () => {
  assert.equal(runtime.target({ id: "../x" }), "id must be lowercase letters, digits and dashes");
  assert.equal(runtime.target({ id: ID }), `no review ${ID}: run save.mjs init first`);
  mkdirSync(path.join(data, "reviews", ID), { recursive: true });
  writeFileSync(path.join(data, "reviews", ID, "review.json"), "{}");
  assert.deepEqual(runtime.target({ id: ID }), { id: ID });
  assert.equal(review.page(ID, { id: ID }), `/r/${ID}`);
  assert.equal(review.reattach(ID), `disconnected: run \`/review:review resume ${ID}\` in the terminal`);
});

test("save.mjs and outcome commands get their own steps; other commands fall to the core", () => {
  const ctx = { dir: path.join(data, "reviews", ID), label: runtime.stepLabel };
  const label = (command: string) => stepLabel("Bash", { command }, ctx)?.label;
  const S = `node "C:\\x\\review\\scripts\\save.mjs"`;
  assert.equal(label(`${S} init --target "last commit" --root . --ref abc`), "Started the review");
  assert.equal(label(`${S} progress --id ${ID} --packet p`), "Saved progress");
  assert.equal(label(`node scripts/save.mjs finish --id ${ID} --packet p`), "Saved the findings");
  assert.equal(label(`${S} stop --id ${ID}`), "Stopped the review");
  assert.equal(label(`belay review outcome ${ID} 1 3 applied`), "Recorded fixes for #1, #3");
  assert.equal(label(`belay review outcome ${ID} 2 manual --note "moved"`), "Recorded follow-up for #2");
  assert.equal(label("git status"), "Ran git");
});
