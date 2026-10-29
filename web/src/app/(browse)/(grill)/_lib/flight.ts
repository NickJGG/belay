import type { Issue } from "../../../../lib/issues.ts";
import type { GrillSession } from "./sessions.ts";

/**
 * Grills in flight: in progress, tagged with a project, and not yet linked from an issue. Legacy grills never count:
 * most were left `in-progress`, and none can be resumed with `/grill resume`.
 */
export function unlinkedGrills(issues: Pick<Issue, "grill">[], grills: GrillSession[]): GrillSession[] {
  const linked = new Set(issues.map((t) => t.grill));
  return grills.filter((g) => !g.legacy && g.status === "in-progress" && g.project && !linked.has(g.slug));
}
