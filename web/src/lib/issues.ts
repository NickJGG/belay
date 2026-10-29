/** Belay issues, as belay's store loads them, and the session stage they decide. */
import { owned } from "../../../src/extensions.ts";
import { compareIds, type Issue as BelayIssue } from "../../../src/store.ts";
import type { SessionBase } from "./sessions.ts";

export type Issue = Pick<BelayIssue, "id" | "title" | "project" | "status" | "extra" | "updated">;

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

export const isClosed = (i: Issue): boolean => i.status === "done" || i.status === "dropped";

/**
 * In progress is grilling; planned with any open issue is building; everything else (planned with every issue
 * closed or none at all, abandoned) is shipped.
 */
export function stage(session: Pick<SessionBase, "status">, issues: Issue[]): Stage {
  if (session.status === "in-progress") return "grilling";
  if (session.status === "planned" && issues.some((i) => !isClosed(i))) return "building";
  return "shipped";
}
