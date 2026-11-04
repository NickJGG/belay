/** The issues each grill links to, and the stage they decide. */
import { owned } from "../../../../src/extensions.ts";
import { compareIds } from "../../../../src/store.ts";
import { isClosed, type Issue } from "../../../../web/src/lib/issues.ts";
import type { SessionBase } from "../../../../web/src/lib/sessions.ts";

export type Stage = "grilling" | "building" | "shipped";

export const STAGES: Stage[] = ["grilling", "building", "shipped"];

/** Issues per grill session slug, each list in id order. */
export function issuesByGrill<T extends Issue>(issues: T[]): Map<string, T[]> {
  const out = new Map<string, T[]>();
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
export function byGrillOf<T extends Issue>(issues: T[]): Map<string, T[]> {
  let by = grouped.get(issues);
  if (!by) grouped.set(issues, (by = issuesByGrill(issues)));
  // Keyed by the list itself, so its groups hold that list's own issues.
  return by as Map<string, T[]>;
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
