import { notFound } from "next/navigation";
import { BodyEditor, Comments } from "@/components/belay/editors";
import { IssueFacts } from "@/components/belay/issue-facts";
import { IssueHead } from "@/components/belay/issue-head";
import styles from "@/components/belay/belay.module.css";
import { ShellSlot } from "@/components/layout/shell-slot";
import { issueDetail } from "@/lib/data";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props) {
  const id = decodeURIComponent((await params).id).toUpperCase();
  const d = await issueDetail(id);
  return { title: `${d ? `${d.issue.id} ${d.issue.title}` : id} — Belay` };
}

/** An issue: the faded header with its title line, the facts table, the description, then comments. */
export default async function IssuePage({ params }: Props) {
  const d = await issueDetail(decodeURIComponent((await params).id));
  if (!d) notFound();
  const { issue } = d;
  return (
    <div className={styles.page}>
      <ShellSlot project={{ key: issue.project, name: d.project?.name ?? issue.project }} section="Issues" />
      <IssueHead issue={issue} hasPlan={!!d.plan} blocks={d.blocks} />
      <IssueFacts issue={issue} plan={d.plan} blockers={d.blockers} blocks={d.blocks} candidates={d.candidates} />
      <BodyEditor id={issue.id} body={issue.body} hash={d.hash} />
      <Comments id={issue.id} comments={issue.comments} />
    </div>
  );
}
