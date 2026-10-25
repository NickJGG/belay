"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLive } from "@/components/live/live-provider";
import { CourseBook, ProjectMark } from "@/components/project-mark";
import { TurnDot } from "@/components/turn-dot";
import type { LiveItem } from "@/lib/data";
import { pageTab } from "@/lib/shell";
import { cn } from "@/lib/utils";
import styles from "./live-tabs.module.css";

/** Where a live session stands, for its Tab's hover title (the TurnDot shows it). */
export const turnState = (s: Pick<LiveItem, "working">) => (s.working ? "working" : "your turn");

/** A Tab's name: a grill's slug, a lesson's topic. */
export const tabTitle = (s: Pick<LiveItem, "kind" | "slug" | "topic">) => (s.kind === "lesson" ? s.topic : s.slug);

/** A Tab's hover title: its project or course, topic and state. */
export const tabHover = (s: LiveItem) => `${s.kind === "lesson" ? s.course : (s.mark?.name ?? "Unfiled")} · ${s.topic} · ${turnState(s)}`;

/** A Tab's marker: a lesson's course book, a grill's project mark. */
export const TabMark = ({ s }: { s: LiveItem }) => (s.kind === "lesson" ? <CourseBook color={s.color} /> : <ProjectMark mark={s.mark} />);

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
            title={tabHover(s)}
          >
            <TurnDot working={s.working} />
            <TabMark s={s} />
            <span className={styles.title}>{tabTitle(s)}</span>
          </Link>
        );
      })}
    </nav>
  );
}
