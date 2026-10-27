import Link from "next/link";
import { notFound } from "next/navigation";
import { firstLine } from "../../../../../../../src/logs.ts";
import { LogText } from "@/components/belay/editors";
import { LogFacts, LogHead } from "@/components/belay/log-entry";
import styles from "@/components/belay/belay.module.css";
import { PageHeader } from "@/components/layout/page-header";
import { ShellSlot } from "@/components/layout/shell-slot";
import { projectColor } from "@/components/project-mark";
import { dayLabel } from "@/lib/belay-view";
import { logDetail } from "@/lib/data";
import { projectHref } from "@/lib/hrefs";

type Props = { params: Promise<{ day: string; n: string }>; searchParams: Promise<{ at?: string }> };

async function load({ params, searchParams }: Props) {
  const { day, n } = await params;
  return { day, n, d: await logDetail(day, Number(n), (await searchParams).at) };
}

export async function generateMetadata(props: Props) {
  const { day, n, d } = await load(props);
  return { title: `${d && !("gone" in d) ? firstLine(d.entry.text).line : `${day}/${n}`} • Belay` };
}

/** A log entry, built like the issue page: faded header, facts table, then the text after its first line. */
export default async function LogPage(props: Props) {
  const { day, n, d } = await load(props);
  if (!d) notFound();
  if ("gone" in d) {
    return (
      <div className={styles.page}>
        <PageHeader title="Moved or deleted" />
        <p className={styles.muted}>
          This log entry moved or was deleted.{" "}
          <Link className={styles.linkish} href={d.project ? projectHref(d.project, "/logs") : "/p"}>
            {d.project ? `Back to ${d.project}'s logs` : "Back to Projects"}
          </Link>
        </p>
      </div>
    );
  }
  const { entry } = d;
  const address = `${day}/${n}`;
  const title = firstLine(entry.text).line;
  return (
    <div className={styles.page}>
      <ShellSlot project={{ key: entry.project, name: d.project?.name ?? entry.project }} section="Logs" glow={d.project && projectColor(d.project)} />
      <LogHead title={title} address={address} day={day} at={entry.at} project={entry.project} />
      <LogFacts
        address={address}
        entry={entry}
        day={[day, dayLabel(day, d.today)]}
        days={d.days.map((x) => [x, dayLabel(x, d.today)])}
        kinds={d.project?.kinds ?? []}
        issue={d.issue}
        candidates={d.candidates}
      />
      <LogText address={address} at={entry.at} text={entry.text} />
    </div>
  );
}
