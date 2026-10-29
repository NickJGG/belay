import { owned } from "../../../../src/extensions.ts";
import type { Issue } from "../../../../web/src/lib/issues.ts";
import type { GrillSession } from "./sessions.ts";

/**
 * Grills in flight: in progress, tagged with a project, and not yet linked from an issue. Legacy grills never count:
 * most were left `in-progress`, and none can be resumed with `/grill:grill resume`.
 */
export function unlinkedGrills(issues: Pick<Issue, "extra">[], grills: GrillSession[]): GrillSession[] {
  const linked = new Set(issues.map((t) => owned(t, "grill").grill));
  return grills.filter((g) => !g.legacy && g.status === "in-progress" && g.project && !linked.has(g.slug));
}

/** Belay's In flight grills with the live ones moved first, and any live grill its rule left out (no project tag) added. */
export function flightGrills<G extends { slug: string }>(flight: G[], live: G[]): G[] {
  const on = new Set(live.map((g) => g.slug));
  return [...live, ...flight.filter((g) => !on.has(g.slug))];
}
