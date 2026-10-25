import Link from "next/link";
import { notFound } from "next/navigation";
import belay from "@/components/belay/belay.module.css";
import { Facts, None } from "@/components/belay/facts";
import { Prose } from "@/components/content/prose";
import styles from "@/components/course/course.module.css";
import { DetailHead } from "@/components/course/detail-head";
import { TopicIcon } from "@/components/course/topic-icon";
import { ShellSlot } from "@/components/layout/shell-slot";
import { courseData, knowledgeDetail } from "@/lib/course-data";
import { courseColor, topicIndex } from "@/lib/courses";
import { shortDate, statusLabel } from "@/lib/format";
import { courseHref } from "@/lib/hrefs";

type Props = { params: Promise<{ c: string; topic: string }> };

export async function generateMetadata({ params }: Props) {
  const { c, topic } = await params;
  const course = await courseData(c);
  return { title: `${(course && knowledgeDetail(course, topic)?.title) ?? topic} — Belay` };
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

/**
 * A knowledge note (grill Q30), like the issue page: ‹ Notes, the title and ⋯ on the faded art, a facts table
 * (Unit · Status · Claims / Lessons · Misconceptions · Cards), then the prose in one column.
 */
export default async function KnowledgePage({ params }: Props) {
  const { c, topic } = await params;
  const course = await courseData(c);
  const d = course && knowledgeDetail(course, topic);
  if (!course || !d) notFound();
  const base = courseHref(c);
  const last = d.lessons[0];
  return (
    <div className={belay.page}>
      <ShellSlot course={{ slug: c, title: course.title }} section="Notes" detail={{ label: d.title, href: courseHref(c, `/knowledge/${topic}`) }} />
      <DetailHead title={d.title} back={{ href: `${base}/notes`, label: "Notes" }} color={courseColor(course)} seed={c} file={d.abs} />
      <Facts
        facts={[
          ["Unit", d.unit ? <Link href={base}>{`${d.unit.n} · ${d.unit.title}`}</Link> : <None />],
          [
            "Status",
            d.status ? (
              <>
                <TopicIcon status={d.status} />
                {statusLabel(d.status)}
              </>
            ) : (
              <None>Not in the syllabus</None>
            ),
          ],
          ["Claims", `${d.claims} · ${plural(d.sources, "source")}`],
          ["Lessons", d.lessons.length ? <Link href={`${base}/lessons`}>{`${d.lessons.length} · last ${shortDate(last.date)}`}</Link> : <None />],
          ["Misconceptions", d.misconceptions ? <Link href={`${base}/misconceptions`}>{d.misconceptions}</Link> : <None />],
          ["Cards", d.cards.total ? <Link href={`${base}/cards`}>{`${d.cards.total} · ${d.cards.due} due`}</Link> : <None />],
        ]}
      />
      <div className={styles.kbody}>
        <Prose markdown={d.body} course={{ course: c, topics: topicIndex(course) }} />
      </div>
    </div>
  );
}
