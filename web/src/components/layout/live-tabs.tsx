"use client";

import Link from "next/link";
import { useLive } from "@/components/live/live-provider";
import { TurnDot } from "@/components/turn-dot";
import type { LiveItem } from "@/lib/data";
import { cn } from "@/lib/utils";
import styles from "./live-tabs.module.css";

/** Where a live grill stands, as its Tab and the Strip say it. */
export const turnState = (s: Pick<LiveItem, "working">) => (s.working ? "working" : "your turn");

/** One Tab per attached grill, above the page; the selected one is what the Drawer shows. Nothing while none is live. */
export function LiveTabs() {
  const { live, selected, select } = useLive();
  if (!live.length) return null;
  return (
    <nav className={styles.tabs} aria-label="Live">
      {live.map((s) => {
        const on = s.slug === selected?.slug;
        return (
          <Link
            key={s.slug}
            href={`/s/${s.slug}`}
            onClick={() => select(s.slug)}
            className={cn(styles.tab, on && styles.on)}
            aria-current={on ? "true" : undefined}
            title={`${s.mark?.name ?? "Unfiled"} · ${s.topic}`}
          >
            <TurnDot working={s.working} />
            <span className={styles.kind}>grill</span>
            <span className={styles.title}>{s.slug}</span>
            <span className={styles.state}>{turnState(s)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
