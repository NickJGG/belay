"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { TurnDot } from "@/components/turn-dot";
import { shortDate } from "@/lib/format";
import { grillHref } from "@/lib/hrefs";
import type { Stage } from "@/lib/issues";
import { cn } from "@/lib/utils";
import styles from "./belay.module.css";

// Not issues.ts's STAGES: importing a value from it would bundle the CLI's store into the client.
const STAGES: Stage[] = ["grilling", "building", "shipped"];
const LABELS: Record<Stage, string> = { grilling: "Still grilling", building: "Building", shipped: "Shipped" };
const NONE: Record<Stage, string> = { grilling: "No grills still going.", building: "Nothing building.", shipped: "Nothing shipped yet." };

export type GrillRow = {
  slug: string;
  topic: string;
  updated?: string;
  live: boolean;
  working?: boolean;
  /** Where it stands, from `grillStanding`. */
  standing: string;
};

const subscribeHash = (cb: () => void) => {
  addEventListener("hashchange", cb);
  return () => removeEventListener("hashchange", cb);
};

/**
 * A project's grills under a Still grilling · Building · Shipped filter, kept in the hash. Rows are
 * one line: the date, a live dot, the topic, then where it stands; the slug shows on hover.
 */
export function GrillList({ stages }: { stages: Record<Stage, GrillRow[]> }) {
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
            <li key={g.slug} className={styles.row} title={g.slug}>
              <span className={styles.date}>{shortDate(g.updated)}</span>
              {g.live ? <TurnDot working={!!g.working} /> : <span className={styles.dot} aria-hidden />}
              <Link href={grillHref(g.slug)} className={cn(styles.grow, styles.stretch)}>
                {g.topic}
              </Link>
              <span className={styles.side}>{g.standing}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.empty}>{NONE[tab]}</p>
      )}
    </>
  );
}
