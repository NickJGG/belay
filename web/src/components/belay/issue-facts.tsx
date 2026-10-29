"use client";

import type { ExtensionId } from "../../../../src/extension-ids.ts";
import type { Issue } from "../../../../src/store.ts";
import { setIssueBlockers } from "@/app/actions";
import { useLive } from "@/components/live/live-provider";
import type { Ref } from "@/lib/data";
import { activeClientSlots } from "@/lib/extensions.client";
import { Chip, IssuePicker, useAction } from "./controls";
import { Facts, type Fact } from "./facts";

const day = (at: string) => (at.length > 10 ? <span title={at.replace("T", " ")}>{at.slice(0, 10)}</span> : at);

/**
 * The issue's facts: the record (Created · Updated · Source), then its links: the active extensions' (a grill's Grill
 * and Plan), Blocked by, and Blocks when it blocks any.
 */
export function IssueFacts({
  issue,
  ext,
  blockers,
  blocks,
  candidates,
}: {
  issue: Pick<Issue, "id" | "project" | "created" | "updated" | "source">;
  /** What each active extension's facts draw from. */
  ext: Partial<Record<ExtensionId, unknown>>;
  blockers: Ref[];
  blocks: Ref[];
  candidates: Ref[];
}) {
  const [pending, run] = useAction();
  const { active } = useLive();
  const facts: Fact[] = [
    ["Created", day(issue.created)],
    ["Updated", day(issue.updated)],
    ["Source", issue.source],
    ...activeClientSlots(active).flatMap((s) => (s.id in ext ? (s.issueFacts?.(issue.id, ext[s.id], run, pending) ?? []) : [])),
    [
      "Blocked by",
      <IssuePicker
        key="picker"
        label="Blocked by"
        value={blockers}
        onChange={(ids) => run(() => setIssueBlockers(issue.id, ids))}
        candidates={candidates}
        preferProject={issue.project}
        disabled={pending}
      />,
    ],
  ];
  if (blocks.length) facts.push(["Blocks", blocks.map((b) => <Chip key={b.id} r={b} />)]);
  return <Facts facts={facts} />;
}
