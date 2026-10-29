/** Belay issues, as belay's store loads them. */
import type { Issue as BelayIssue } from "../../../src/store.ts";

export type Issue = Pick<BelayIssue, "id" | "title" | "project" | "status" | "extra" | "updated">;

export const isClosed = (i: Issue): boolean => i.status === "done" || i.status === "dropped";
