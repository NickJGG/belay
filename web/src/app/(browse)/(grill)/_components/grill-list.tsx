"use client";

import { useSyncExternalStore } from "react";
import type { Stage } from "../_lib/issues";
import { cn } from "@/lib/utils";
import { GrillRow } from "./grill-row";
import styles from "@/components/belay/belay.module.css";

// Not _lib/issues.ts's STAGES: importing a value from it would bundle the CLI's store into the client.
const STAGES: Stage[] = ["grilling", "building", "shipped"];
const LABELS: Record<Stage, string> = { grilling: "Still grilling", building: "Building", shipped: "Shipped" };
const NONE: Record<Stage, string> = { grilling: "No grills still going.", building: "Nothing building.", shipped: "Nothing shipped yet." };

export type GrillItem = {
  slug: string;
  topic: string;
  updated?: string;
  live: boolean;
  working?: boolean;
  /** Building only: `done/total`, from `grillProgress`. */
  progress?: string;
};

const subscribeHash = (cb: () => void) => {
  addEventListener("hashchange", cb);
  return () => removeEventListener("hashchange", cb);
};

/**
 * A project's grills under a Still grilling · Building · Shipped filter, kept in the hash, as `GrillRow`s;
 * a Building row shows its progress before the date.
 */
export function GrillList({ stages }: { stages: Record<Stage, GrillItem[]> }) {
  const hash = useSyncExternalStore(subscribeHash, () => location.hash, () => "");
  const tab = STAGES.find((st) => `#${st}` === hash) ?? STAGES.find((st) => stages[st].length) ?? "grilling";
  return (
    <>
      <div className={styles.filter} role="tablist">
        {STAGES.map((st) => (
          <a key={st} href={`#${st}`} role="tab" aria-selected={st === tab} className={cn(styles.pill, st === tab && styles.pillOn)}>
            {LABELS[st]}
            <span className={styles.count}>{stages[st].length}</span>
          </a>
        ))}
      </div>
      {stages[tab].length ? (
        <ul className={styles.rows} role="tabpanel">
          {stages[tab].map((g) => (
            <GrillRow key={g.slug} slug={g.slug} topic={g.topic} updated={g.updated} live={g.live} working={g.working} side={g.progress} />
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>{NONE[tab]}</p>
      )}
    </>
  );
}
