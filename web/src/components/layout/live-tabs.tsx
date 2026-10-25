"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLive } from "@/components/live/live-provider";
import { TurnDot } from "@/components/turn-dot";
import type { LiveItem } from "@/lib/data";
import { pageTab } from "@/lib/shell";
import { cn } from "@/lib/utils";
import styles from "./live-tabs.module.css";

/** Where a live session stands, as its Tab and the Strip say it. */
export const turnState = (s: Pick<LiveItem, "working">) => (s.working ? "working" : "your turn");

/** A Tab's name: a grill's slug, a lesson's topic. */
export const tabTitle = (s: Pick<LiveItem, "kind" | "slug" | "topic">) => (s.kind === "lesson" ? s.topic : s.slug);

/**
 * One Tab per attached grill or lesson, above the page. The open page's Tab looks like the page's own; the selected one
 * elsewhere (what the Drawer shows) only keeps a faint underline. Nothing while none is live.
 */
export function LiveTabs() {
  const { live, selected, select } = useLive();
  const here = pageTab(usePathname() ?? "/", live);
  if (!live.length) return null;
  return (
    <nav className={styles.tabs} aria-label="Live">
      {live.map((s) => {
        const on = s.slug === here;
        const picked = !on && s.slug === selected?.slug;
        return (
          <Link
            key={s.slug}
            href={s.href}
            onClick={() => select(s.slug)}
            className={cn(styles.tab, on && styles.on, picked && styles.picked)}
            aria-current={on ? "page" : picked ? "true" : undefined}
            title={s.kind === "lesson" ? `${s.course} · ${s.topic}` : `${s.mark?.name ?? "Unfiled"} · ${s.topic}`}
          >
            <TurnDot working={s.working} />
            <span className={styles.kind}>{s.kind}</span>
            <span className={styles.title}>{tabTitle(s)}</span>
            <span className={styles.state}>{turnState(s)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
