import Link from "next/link";
import { PenLine } from "lucide-react";
import type { ActivityDay, ActivityEvent } from "../../../../src/home.ts";
import { firstLine } from "../../../../src/logs.ts";
import { ProjectMark } from "@/components/project-mark";
import { dayLabel, gapLabel } from "@/lib/belay-view";
import type { Mark } from "@/lib/data";
import { issueHref, logHref } from "@/lib/hrefs";
import { cn } from "@/lib/utils";
import { Group } from "./group";
import { keyColumn } from "./issue-rows";
import { MoreLink } from "./more-link";
import { StatusIcon } from "./status-icon";
import styles from "./belay.module.css";

function Event({ e, marks }: { e: ActivityEvent; marks?: Record<string, Mark> }) {
  if (e.type === "transition") {
    return (
      <li className={styles.row}>
        <StatusIcon status={e.to} />
        {marks ? <ProjectMark mark={marks[e.issue.project] ?? null} /> : null}
        <span className={styles.keyTitle}>
          <Link className={cn(styles.key, styles.stretch)} href={issueHref(e.issue.id)}>
            {e.issue.id}
          </Link>
          <span className={styles.grow}>{e.issue.title}</span>
        </span>
      </li>
    );
  }
  const { entry } = e;
  return (
    <li className={styles.row}>
      <PenLine className={styles.muted} size={14} aria-label="Log entry" />
      <Link className={cn(styles.grow, styles.stretch)} href={logHref(entry.day, entry.n, entry.at)}>
        {firstLine(entry.text).line}
      </Link>
    </li>
  );
}

/**
 * Belay's Activity: work days newest first, each a collapsible group of every issue move and log entry,
 * with a ring per day on the rail to the left; runs of empty days collapse to one muted line. `marks` (Home, across
 * projects) puts each issue's project mark before its key.
 */
export function Activity({
  feed,
  today,
  scope,
  earlierHref,
  marks,
}: {
  feed: ActivityDay[];
  today: string;
  scope: string;
  earlierHref: string;
  marks?: Record<string, Mark>;
}) {
  const ids = feed.flatMap((d) => ("day" in d ? d.events.flatMap((e) => (e.type === "transition" ? [e.issue.id] : [])) : []));
  return (
    <>
      <div className={styles.feed} style={keyColumn(ids)}>
        {feed.map((d) =>
          "gap" in d ? (
            <section key={d.gap.to} className={cn(styles.day, styles.gap)}>
              {gapLabel(d.gap.from, d.gap.to, today)}
            </section>
          ) : (
            <section key={d.day} className={styles.day}>
              <span className={styles.ring} aria-hidden />
              <Group id={`${scope}:${d.day}`} label={dayLabel(d.day, today)} count={d.events.length}>
                <ul className={styles.rows}>
                  {d.events.map((e) => (
                    <Event key={e.type === "log" ? `log-${e.entry.day}-${e.entry.n}-${e.at}` : `${e.issue.id}-${e.at}`} e={e} marks={marks} />
                  ))}
                </ul>
              </Group>
            </section>
          ),
        )}
      </div>
      <MoreLink href={earlierHref}>Show earlier</MoreLink>
    </>
  );
}
