"use client";

import Link from "next/link";
import type { Issue } from "../../../../src/store.ts";
import { openLinkedFile, setIssueBlockers } from "@/app/actions";
import type { Ref } from "@/lib/data";
import { grillHref } from "@/lib/hrefs";
import { Chip, IssuePicker, useAction } from "./controls";
import { Facts, None, type Fact } from "./facts";
import styles from "./belay.module.css";

const day = (at: string) => (at.length > 10 ? <span title={at.replace("T", " ")}>{at.slice(0, 10)}</span> : at);

/** The issue's facts: the record (Created · Updated · Source), then its links (Grill · Plan · Blocked by, + Blocks). */
export function IssueFacts({
  issue,
  plan,
  blockers,
  blocks,
  candidates,
}: {
  issue: Pick<Issue, "id" | "project" | "created" | "updated" | "source" | "grill">;
  plan?: string;
  blockers: Ref[];
  blocks: Ref[];
  candidates: Ref[];
}) {
  const [pending, run] = useAction();
  const facts: Fact[] = [
    ["Created", day(issue.created)],
    ["Updated", day(issue.updated)],
    ["Source", issue.source],
    [
      "Grill",
      issue.grill ? (
        <Link href={grillHref(issue.grill)} title={issue.grill}>
          {issue.grill}
        </Link>
      ) : (
        <None />
      ),
    ],
    [
      "Plan",
      plan ? (
        <button type="button" className={styles.linkish} title={plan} onClick={() => run(() => openLinkedFile(issue.id, "plan"))} disabled={pending}>
          {plan.split(/[\\/]/).pop()}
        </button>
      ) : (
        <None />
      ),
    ],
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
