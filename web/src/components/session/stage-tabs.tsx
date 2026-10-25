"use client";

import { useMemo, useSyncExternalStore } from "react";
import type { WorkItem } from "@/lib/data";
import type { Stage } from "@/lib/issues";
import { cn } from "@/lib/utils";
import { WorkRows } from "./session-list";
import styles from "./stage-tabs.module.css";

// Not issues.ts's STAGES: importing a value from it would bundle its node:fs reads into the client.
const STAGES: Stage[] = ["grilling", "building", "shipped"];
const LABELS: Record<Stage, string> = { grilling: "Still grilling", building: "Building", shipped: "Shipped" };
const NONE: Record<Stage, string> = { grilling: "No sessions still grilling.", building: "Nothing building.", shipped: "Nothing shipped yet." };

const subscribeHash = (cb: () => void) => {
  addEventListener("hashchange", cb);
  return () => removeEventListener("hashchange", cb);
};

/** A project's sessions in Still grilling · Building · Shipped tabs; the tab is the hash, else the first non-empty one. */
export function StageTabs({ stages, matched }: { stages: Record<Stage, WorkItem[]>; matched?: string[] }) {
  const hash = useSyncExternalStore(subscribeHash, () => location.hash, () => "");
  const fromHash = STAGES.find((st) => `#${st}` === hash);
  const tab = fromHash ?? STAGES.find((st) => stages[st].length) ?? "grilling";
  const matchedSet = useMemo(() => (matched ? new Set(matched) : undefined), [matched]);

  return (
    <div className={styles.wrap}>
      <div className={styles.tabs} role="tablist">
        {STAGES.map((st) => (
          <a
            key={st}
            href={`#${st}`}
            id={`tab-${st}`}
            role="tab"
            aria-selected={st === tab}
            aria-controls="stage-panel"
            className={cn(styles.tab, st === tab && styles.on)}
          >
            {LABELS[st]} <span className={styles.count}>{stages[st].length}</span>
          </a>
        ))}
      </div>
      <div id="stage-panel" role="tabpanel" aria-labelledby={`tab-${tab}`}>
        {stages[tab].length ? (
          <WorkRows sessions={stages[tab]} matched={matchedSet} />
        ) : (
          <p className={styles.none}>{NONE[tab]}</p>
        )}
      </div>
    </div>
  );
}
