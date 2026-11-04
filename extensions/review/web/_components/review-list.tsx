"use client";

import { useSyncExternalStore } from "react";
import { cn } from "@/lib/utils";
import belay from "@/components/belay/belay.module.css";
import type { ListRow } from "../_lib/projects.server";
import { FILTER_LABEL, FILTERS, filterRows, openFilter } from "../_lib/view";
import { ReviewRow } from "./review-row";

const NONE = { "needs-you": "Nothing needs you.", done: "No reviews done yet.", all: "No reviews yet. Run /review:review in a repo." } as const;

const subscribeHash = (cb: () => void) => {
  addEventListener("hashchange", cb);
  return () => removeEventListener("hashchange", cb);
};

/** A project's reviews under a Needs you · Done · All filter, kept in the hash. */
export function ReviewList({ rows }: { rows: ListRow[] }) {
  const hash = useSyncExternalStore(subscribeHash, () => location.hash, () => "");
  const tab = openFilter(hash, rows);
  const list = filterRows(rows, tab) as ListRow[];
  return (
    <>
      <div className={belay.filter} role="tablist">
        {FILTERS.map((f) => (
          <a key={f} href={`#${f}`} role="tab" aria-selected={f === tab} className={cn(belay.pill, f === tab && belay.pillOn)}>
            {FILTER_LABEL[f]}
            <span className={belay.count}>{filterRows(rows, f).length}</span>
          </a>
        ))}
      </div>
      {list.length ? (
        <ul className={belay.rows} role="tabpanel">
          {list.map((r) => (
            <ReviewRow key={r.id} row={r} live={r.live} working={r.working} />
          ))}
        </ul>
      ) : (
        <p className={belay.empty}>{NONE[tab]}</p>
      )}
    </>
  );
}
