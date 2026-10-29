import assert from "node:assert/strict";
import { test } from "node:test";
import { unlinkedGrills } from "../flight.ts";
import type { GrillSession } from "../sessions.ts";

test("grills in flight: in progress, tagged, not yet linked, not legacy", () => {
  const g = (slug: string, over: Partial<GrillSession> = {}): GrillSession => ({
    slug,
    topic: "",
    status: "in-progress",
    project: "BEL",
    questions: [],
    mock: false,
    legacy: false,
    ...over,
  });
  const grills = [g("open"), g("linked"), g("untagged", { project: undefined }), g("planned", { status: "planned" }), g("old", { legacy: true })];
  assert.deepEqual(
    unlinkedGrills([{ extra: [{ key: "grill", value: "linked", after: "source" }] }, {}], grills).map((s) => s.slug),
    ["open"],
  );
});
