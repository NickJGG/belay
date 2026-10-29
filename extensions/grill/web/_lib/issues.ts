/** The issues each grill links to, and the stage they decide. */
import { owned } from "../../../../src/extensions.ts";
import { compareIds } from "../../../../src/store.ts";
import { isClosed, type Issue } from "../../../../web/src/lib/issues.ts";
import type { SessionBase } from "../../../../web/src/lib/sessions.ts";

export type Stage = "grilling" | "building" | "shipped";

export const STAGES: Stage[] = ["grilling", "building", "shipped"];

/** Issues per grill session slug, each list in id order. */
export function issuesByGrill(issues: Issue[]): Map<string, Issue[]> {
  const out = new Map<string, Issue[]>();
  for (const i of [...issues].sort((a, b) => compareIds(a.id, b.id))) {
    const { grill } = owned(i, "grill");
    if (!grill) continue;
    const list = out.get(grill);
    if (list) list.push(i);
    else out.set(grill, [i]);
  }
  return out;
}

const grouped = new WeakMap<readonly Issue[], Map<string, Issue[]>>();

/** `issuesByGrill`, worked out once per issue list (belay's, which a request loads once). */
export function byGrillOf(issues: Issue[]): Map<string, Issue[]> {
  let by = grouped.get(issues);
  if (!by) grouped.set(issues, (by = issuesByGrill(issues)));
  return by;
}

/**
 * In progress is grilling; planned with any open issue is building; everything else (planned with every issue
 * closed or none at all, abandoned) is shipped.
 */
export function stage(session: Pick<SessionBase, "status">, issues: Issue[]): Stage {
  if (session.status === "in-progress") return "grilling";
  if (session.status === "planned" && issues.some((i) => !isClosed(i))) return "building";
  return "shipped";
}

/** A building grill's `done/total`, for its Grills row; nothing for any other. */
export function grillProgress(g: { stage: Stage; progress?: { done: number; total: number } }): string | undefined {
  return g.stage === "building" && g.progress ? `${g.progress.done}/${g.progress.total}` : undefined;
}
