import Link from "next/link";
import { notFound } from "next/navigation";
import { firstLine, type DatedEntry } from "../../../../../../../src/logs.ts";
import { logDays } from "../../../../../../../src/ops.ts";
import { Group } from "@/components/belay/group";
import { LogComposer } from "@/components/belay/log-composer";
import styles from "@/components/belay/belay.module.css";
import { belay, projectLogs } from "@/lib/data";
import { dayLabel, kindTotals } from "@/lib/belay-view";
import { issueHref, logHref, projectHref, UNFILED } from "@/lib/hrefs";
import { cn } from "@/lib/utils";

type Props = { params: Promise<{ key: string }>; searchParams: Promise<{ all?: string }> };

export async function generateMetadata({ params }: Props) {
  return { title: `${decodeURIComponent((await params).key).toUpperCase()} logs • Belay` };
}

function Entry({ e }: { e: DatedEntry }) {
  const { line, more } = firstLine(e.text);
  return (
    <li className={styles.row}>
      <time className={styles.time} dateTime={e.at} title={`Logged ${e.at.replace("T", " ")}`}>
        {e.at.slice(11)}
      </time>
      <Link className={cn(styles.grow, styles.stretch)} href={logHref(e.day, e.n, e.at)}>
        {line}
        {more ? <span className={styles.muted}> …</span> : null}
      </Link>
      {e.kind ? (
        <span className={styles.badge}>
          {e.kind}
          {(e.count ?? 1) > 1 && ` ×${e.count}`}
        </span>
      ) : null}
      {e.minutes ? <span className={styles.side}>{e.minutes}m</span> : null}
      {e.issue ? (
        <Link className={cn(styles.key, styles.above)} href={issueHref(e.issue)}>
          {e.issue}
        </Link>
      ) : null}
      {e.by === "claude" ? <span className={styles.badge}>claude</span> : null}
    </li>
  );
}

/** A project's Logs: the "Log what you did" composer, then its entries newest first, by work day. */
export default async function ProjectLogs({ params, searchParams }: Props) {
  const key = decodeURIComponent((await params).key).toUpperCase();
  if (key === UNFILED.toUpperCase()) notFound();
  const all = (await searchParams).all === "1";
  const { today, entries, older } = await projectLogs(key, all);
  const kinds = belay().projects.find((p) => p.key === key)?.kinds ?? [];
  const days = Map.groupBy(entries, (e) => e.day);
  return (
    <>
      <LogComposer project={key} kinds={kinds} days={logDays(today).map((d) => [d, dayLabel(d, today)])} />
      {!days.size ? <p className={styles.empty}>No log entries{all ? "" : " in the last four weeks"}.</p> : null}
      {[...days].map(([day, list]) => {
        const totals = kindTotals(list);
        return (
          <Group key={day} id={`${key}:log:${day}`} label={dayLabel(day, today)} count={totals || list.length}>
            <ul className={styles.rows}>
              {list.map((e) => (
                <Entry key={`${e.day}/${e.n}-${e.at}`} e={e} />
              ))}
            </ul>
          </Group>
        );
      })}
      {older > 0 ? (
        <Link className={styles.more} href={projectHref(key, "/logs?all=1")}>
          {older} older {older === 1 ? "entry" : "entries"}
        </Link>
      ) : null}
    </>
  );
}
