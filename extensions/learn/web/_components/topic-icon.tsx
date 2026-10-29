import { StatusIcon } from "@/components/belay/status-icon";
import { statusLabel } from "@/lib/format";
import type { TopicStatus, Unit } from "../_lib/courses";

const AS_ISSUE = { todo: "todo", "in-progress": "doing", done: "done" } as const;

/** A syllabus topic's status as belay's icon: todo, doing for in progress, done. */
export function TopicIcon({ status }: { status: TopicStatus }) {
  return <StatusIcon status={AS_ISSUE[status]} label={statusLabel(status)} />;
}

/** A unit's checkpoint result: "pending", or "pass · 2026-10-24 · 85%". */
export function checkpointText(cp: Unit["checkpoint"]): string {
  if (!cp || cp.result === "pending") return "pending";
  return [cp.result, cp.date, cp.score === null ? null : `${cp.score}%`].filter(Boolean).join(" · ");
}
