import assert from "node:assert/strict";
import { test } from "node:test";
import { flightGrills, unlinkedGrills } from "../flight.ts";
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

test("live grills lead In flight, once each, untagged ones included", () => {
  const g = (slug: string) => ({ slug });
  assert.deepEqual(flightGrills([g("a"), g("b"), g("c")], [g("c"), g("z")]).map((x) => x.slug), ["c", "z", "a", "b"]);
  assert.deepEqual(flightGrills([g("a")], []).map((x) => x.slug), ["a"]);
});
