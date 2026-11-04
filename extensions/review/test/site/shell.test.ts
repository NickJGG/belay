import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { missing, pageKind, pageTab } from "../../../../web/src/lib/shell.ts";
import { pseudoProject, sectionsOf, sidebarSections } from "../../../../web/src/lib/sidebar.ts";
import { reviewId, UNFILED } from "../../web/_lib/manifest.ts";
import { listReviews, readReview } from "../../web/_lib/sessions.ts";

const on = ["review"] as const;

test("a review page is a Workspace and its own Tab, while review is active", () => {
  assert.equal(reviewId("/r/review-1"), "review-1");
  assert.equal(reviewId("/r/review-1/lines"), null);
  assert.equal(pageKind("/r/review-1", on), "workspace");
  assert.equal(pageTab("/r/review-1", [], on), "review-1");
  assert.equal(pageKind("/r/review-1", []), "reading");
  assert.deepEqual(missing("/r/nope", on), { what: "No review nope.", back: { href: "/", label: "Back home" } });
  assert.equal(missing("/r/nope", []).what, "No page at /r/nope.");
});

test("projects get Reviews; Unfiled is shared with grill and lists both its owners' sections", () => {
  assert.deepEqual(
    sectionsOf("BEL", ["grill", "review"]).map((s) => s.label),
    ["Issues", "Grills", "Reviews", "Activity", "Logs"],
  );
  assert.deepEqual(
    sectionsOf(UNFILED, ["grill", "review"]).map((s) => s.label),
    ["Grills", "Reviews"],
  );
  assert.deepEqual(
    sectionsOf(UNFILED, on).map((s) => s.label),
    ["Reviews"],
  );
  assert.equal(pseudoProject(UNFILED, on), "review");
  assert.equal(pseudoProject(UNFILED, ["grill", "review"]), "grill");
  const s = sidebarSections({ kind: "reading", project: { key: UNFILED, name: "Unfiled" } }, "/p/unfiled/reviews", ["grill", "review"]);
  assert.deepEqual(
    s?.rows.find((r) => r.on),
    { label: "Reviews", href: "/p/unfiled/reviews", on: true },
  );
  assert.equal(missing("/p/unfiled", on).what, "No project UNFILED.");
  assert.equal(missing("/p/unfiled", []).what, "No page at /p/unfiled.");
});

test("a review folder reads as a session; campaigns/ and a bare bridge.json are told apart", () => {
  const root = mkdtempSync(join(tmpdir(), "belay-reviews-"));
  try {
    const id = "review-20261104-1402-last-commit";
    mkdirSync(join(root, id));
    const review = { id, project: "BEL", root: "C:/repo", target: "last commit", ref: null, started: "2026-11-04T14:02:00Z", finished: null, status: "running", stages: [] };
    writeFileSync(join(root, id, "review.json"), JSON.stringify(review));
    mkdirSync(join(root, "campaigns"));
    mkdirSync(join(root, "review-bare"));
    writeFileSync(join(root, "review-bare", "bridge.json"), "{}");
    const s = readReview(root, id);
    assert.equal(s?.topic, "Last commit");
    assert.equal(s?.status, "in-progress");
    assert.equal(s?.project, "BEL");
    assert.equal(readReview(root, "campaigns"), null);
    assert.deepEqual(readReview(root, "review-bare"), { slug: "review-bare", topic: "review-bare", status: "in-progress", saved: null });
    writeFileSync(join(root, id, "review.json"), JSON.stringify({ ...review, status: "stopped" }));
    assert.equal(readReview(root, id)?.status, "stopped");
    assert.deepEqual(
      listReviews(root).map((r) => r.slug),
      [id],
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
