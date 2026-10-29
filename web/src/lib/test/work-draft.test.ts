import assert from "node:assert/strict";
import { test } from "node:test";
import { contentHash, draftKey, encodeDraft, restoreDraft } from "../work-draft.ts";

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
