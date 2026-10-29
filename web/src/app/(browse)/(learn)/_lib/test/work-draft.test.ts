import assert from "node:assert/strict";
import { test } from "node:test";
import { contentHash, draftKey, encodeDraft, restoreDraft, saveOutcome, WORK_OFF } from "../work-draft.ts";

test("a draft comes back over the file it was typed over", () => {
  assert.equal(restoreDraft(encodeDraft("edited", "disk"), "disk"), "edited");
});

test("a draft typed over an older file stays away", () => {
  assert.equal(restoreDraft(encodeDraft("edited", "disk"), "disk, changed since"), null);
});

test("nothing is kept when the text matches the file, and nothing comes back that matches it", () => {
  assert.equal(encodeDraft("same", "same"), null);
  assert.equal(restoreDraft(JSON.stringify({ text: "same", base: contentHash("same") }), "same"), null);
});

test("a missing or malformed draft restores nothing", () => {
  for (const raw of [null, "", "{", "[]", "null", '"x"', JSON.stringify({ text: 1, base: contentHash("d") })]) {
    assert.equal(restoreDraft(raw, "d"), null);
  }
});

test("drafts are per course and path, and the hash tells close texts apart", () => {
  assert.notEqual(draftKey("a", "work/x.md"), draftKey("b", "work/x.md"));
  assert.notEqual(draftKey("a", "work/x.md"), draftKey("a", "work/y.md"));
  assert.notEqual(contentHash("ab"), contentHash("ba"));
  assert.match(contentHash(""), /^[0-9a-f]{8}$/);
});

test("a save's response: saved, changed on disk, deleted, or an error", () => {
  assert.deepEqual(saveOutcome(200, { ok: true, mtime: 5 }), { kind: "saved", mtime: 5 });
  assert.deepEqual(saveOutcome(409, { ok: false, error: "Changed on disk.", text: "disk", mtime: 6 }), { kind: "changed", text: "disk", mtime: 6 });
  assert.deepEqual(saveOutcome(409, { ok: false, error: "A file with that name exists." }), { kind: "error", error: "A file with that name exists." });
  assert.deepEqual(saveOutcome(404, { ok: false, error: "Deleted on disk." }), { kind: "deleted" });
  assert.deepEqual(saveOutcome(null, null), { kind: "error", error: "The site server didn't answer." });
});

test("a save the proxy refuses (learn off) is an error that keeps the text, not a deletion", () => {
  assert.deepEqual(saveOutcome(404, null), { kind: "error", error: WORK_OFF });
  const draft = encodeDraft("typed", "disk");
  assert.equal(restoreDraft(draft, "disk"), "typed");
});
