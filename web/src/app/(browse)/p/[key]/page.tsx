import Link from "next/link";
import { redirect } from "next/navigation";
import { CreateIssue } from "@/components/belay/create-issue";
import { Group } from "@/components/belay/group";
import { IssueRows, keyColumn } from "@/components/belay/issue-rows";
import { StatusIcon, statusName } from "@/components/belay/status-icon";
import styles from "@/components/belay/belay.module.css";
import { projectIssues } from "@/lib/data";
import { projectHref, UNFILED } from "@/lib/hrefs";
import { cn } from "@/lib/utils";
import type { Issue, IssueStatus } from "../../../../../../src/store.ts";

type Props = { params: Promise<{ key: string }>; searchParams: Promise<Record<string, string | undefined>> };

export async function generateMetadata({ params }: Props) {
  return { title: `${decodeURIComponent((await params).key).toUpperCase()} • Belay` };
}

/** A project's Issues: an Issues · Ideas filter with +, then issue rows in collapsible status groups. */
export default async function ProjectIssues({ params, searchParams }: Props) {
  const key = decodeURIComponent((await params).key).toUpperCase();
  if (key === UNFILED.toUpperCase()) redirect(projectHref(UNFILED, "/grills"));
  const q = await searchParams;
  const ideas = q.view === "ideas";
  const older = q.older === "1";
  const { board, candidates } = await projectIssues(key, older);
  const href = (edit: Record<string, string | undefined>) => {
    const p = new URLSearchParams(Object.entries({ ...q, ...edit }).filter((e): e is [string, string] => !!e[1]));
    return projectHref(key, p.size ? `?${p}` : "");
  };

  const group = (status: IssueStatus, list: Issue[], opts: { defaultOpen?: boolean; foot?: React.ReactNode } = {}) =>
    list.length > 0 || opts.foot ? (
      <Group key={status} id={status} icon={<StatusIcon status={status} />} label={statusName(status)} count={list.length} defaultOpen={opts.defaultOpen}>
        <IssueRows issues={list} />
        {opts.foot}
      </Group>
    ) : null;
  const shown = ideas ? board.idea : [...board.doing, ...board.todo, ...board.done, ...board.dropped];

  return (
    <>
      <div className={styles.filter}>
        <Link href={href({ view: undefined, older: undefined })} className={cn(styles.pill, !ideas && styles.pillOn)} aria-current={!ideas ? "page" : undefined}>
          Issues
        </Link>
        <Link href={href({ view: "ideas", older: undefined })} className={cn(styles.pill, ideas && styles.pillOn)} aria-current={ideas ? "page" : undefined}>
          Ideas<span className={styles.count}>{board.idea.length}</span>
        </Link>
        <CreateIssue project={key} status={ideas ? "idea" : "todo"} candidates={candidates} />
      </div>
      <div style={keyColumn(shown.map((t) => t.id))}>
        {!shown.length && !board.olderDone ? (
          <p className={styles.empty}>{ideas ? "No ideas." : "No issues."}</p>
        ) : ideas ? (
          group("idea", board.idea)
        ) : (
          <>
            {group("doing", board.doing)}
            {group("todo", board.todo)}
            {group("done", board.done, {
              foot:
                board.olderDone > 0 ? (
                  <Link className={styles.more} href={href({ older: older ? undefined : "1" })} scroll={false}>
                    {older ? "Hide older" : `${board.olderDone} older`}
                  </Link>
                ) : null,
            })}
            {group("dropped", board.dropped, { defaultOpen: false })}
          </>
        )}
      </div>
    </>
  );
}
