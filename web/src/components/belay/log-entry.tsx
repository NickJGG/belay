"use client";

import * as React from "react";
import { MoreHorizontal } from "lucide-react";
import type { LogEntry } from "../../../../src/logs.ts";
import { deleteLogEntry, editLogEntry, openLogFile } from "@/app/actions";
import { PageHeader } from "@/components/layout/page-header";
import type { Ref } from "@/lib/data";
import { projectHref } from "@/lib/hrefs";
import { cn } from "@/lib/utils";
import { Confirm, IssuePicker, MenuButton, TextEdit, useAction } from "./controls";
import { Facts, None, type Fact } from "./facts";
import type { DayOption } from "./log-composer";
import styles from "./belay.module.css";

/** A log entry's header: the faded art, its first line as the title, ⋯ with Open file and Delete. */
export function LogHead({ title, address, day, at, project }: { title: string; address: string; day: string; at: string; project: string }) {
  const [deleting, setDeleting] = React.useState(false);
  const [pending, run] = useAction();
  return (
    <>
      <PageHeader title={title} back={{ href: projectHref(project, "/logs"), label: `${project} logs` }}>
        <MenuButton label="Entry actions" trigger={<MoreHorizontal size={18} aria-hidden />}>
          {(close) => (
            <>
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={() => {
                  close();
                  run(() => openLogFile(day));
                }}
              >
                Open file
              </button>
              <hr className={styles.menuSep} />
              <button
                type="button"
                role="menuitem"
                className={cn(styles.menuItem, styles.menuBad)}
                onClick={() => {
                  close();
                  setDeleting(true);
                }}
              >
                Delete entry
              </button>
            </>
          )}
        </MenuButton>
      </PageHeader>
      <Confirm
        open={deleting}
        onClose={() => setDeleting(false)}
        title={`Delete log entry ${address}?`}
        action="Delete"
        pending={pending}
        onConfirm={() =>
          run(async () => {
            const r = await deleteLogEntry(address, at);
            if (r?.error) setDeleting(false);
            return r;
          })
        }
      >
        <p>This can&apos;t be undone, and later entries on that day move up one number.</p>
      </Confirm>
    </>
  );
}

/** '' clears; anything else must be a whole number, which the op range-checks. */
function numPatch(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isInteger(n)) throw new Error(`'${s}' is not a whole number`);
  return n;
}

/**
 * A log entry's facts: Day · Logged · Issue · Minutes, with Kind and Count only on a project that
 * declares kinds. Each saves on its own; a day move goes to the entry's new address.
 */
export function LogFacts({
  address,
  entry,
  day,
  days,
  kinds,
  issue,
  candidates,
}: {
  address: string;
  entry: Pick<LogEntry, "at" | "by" | "project" | "kind" | "count" | "minutes">;
  day: DayOption;
  /** Days it may move to; empty once past the backdate window. */
  days: DayOption[];
  kinds: string[];
  issue?: Ref;
  candidates: Ref[];
}) {
  const [pending, run] = useAction();
  const save = (patch: Parameters<typeof editLogEntry>[2]) => editLogEntry(address, entry.at, patch);
  const saveNum = (field: "count" | "minutes") => async (v: string) => {
    try {
      return await save({ [field]: numPatch(v) });
    } catch (e) {
      return { error: (e as Error).message };
    }
  };
  const facts: Fact[] = [
    [
      "Day",
      days.length ? (
        <select className={styles.select} aria-label="Day" value={day[0]} disabled={pending} onChange={(e) => run(() => save({ day: e.target.value }))}>
          {days.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
      ) : (
        day[1]
      ),
    ],
    ["Logged", `${entry.at.slice(11)} · ${entry.by === "claude" ? "Claude" : "you"}`],
    [
      "Issue",
      <IssuePicker
        key="issue"
        label="Issue"
        value={issue ? [issue] : []}
        onChange={(ids) => run(() => save({ issue: ids.at(-1) ?? "" }))}
        candidates={candidates}
        preferProject={entry.project}
        disabled={pending}
      />,
    ],
    ["Minutes", <TextEdit key="minutes" value={entry.minutes ? String(entry.minutes) : ""} label="Minutes" placeholder="—" save={saveNum("minutes")} />],
  ];
  if (kinds.length || entry.kind) {
    const options = [...new Set([...kinds, ...(entry.kind ? [entry.kind] : [])])];
    facts.push([
      "Kind",
      <select key="kind" className={styles.select} aria-label="Kind" value={entry.kind ?? ""} disabled={pending} onChange={(e) => run(() => save({ kind: e.target.value }))}>
        <option value="">None</option>
        {options.map((k) => (
          <option key={k} value={k}>
            {k}
          </option>
        ))}
      </select>,
    ]);
    facts.push(["Count", entry.kind ? <TextEdit key="count" value={entry.count ? String(entry.count) : ""} label="Count" placeholder="1" save={saveNum("count")} /> : <None>—</None>]);
  }
  return <Facts facts={facts} />;
}
