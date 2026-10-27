import Link from "next/link";
import { notFound } from "next/navigation";
import belay from "@/components/belay/belay.module.css";
import { Facts, None } from "@/components/belay/facts";
import { Prose } from "@/components/content/prose";
import styles from "@/components/course/course.module.css";
import { DetailHead } from "@/components/course/detail-head";
import { ShellSlot } from "@/components/layout/shell-slot";
import { courseData, lessonDetail } from "@/lib/course-data";
import { courseColor, topicIndex, topicTitle } from "@/lib/courses";
import { courseHref } from "@/lib/hrefs";

type Props = { params: Promise<{ c: string; slug: string }> };

export async function generateMetadata({ params }: Props) {
  const { c, slug } = await params;
  const course = await courseData(c);
  return { title: `${(course && lessonDetail(course, slug)?.title) ?? slug} • Belay` };
}

/** `Fri 24 Oct` */
function weekDay(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short" });
}

/**
 * A lesson note, in the knowledge note's layout: a facts table (Date · Topic · Unit / Exercises · Claims ·
 * Open questions), then the note. ⋯ holds Resume conversation and Open file.
 */
export default async function LessonPage({ params }: Props) {
  const { c, slug } = await params;
  const course = await courseData(c);
  const d = course && lessonDetail(course, slug);
  if (!course || !d) notFound();
  const base = courseHref(c);
  const { exercises, alone, claims, questions } = d.stats;
  return (
    <div className={belay.page}>
      <ShellSlot course={{ slug: c, title: course.title }} section="Lessons" />
      <DetailHead
        title={d.title}
        back={{ href: `${base}/lessons`, label: "Lessons" }}
        color={courseColor(course)}
        seed={c}
        file={d.abs}
        lesson={d.session ? { course: c, slug } : undefined}
      />
      <Facts
        facts={[
          ["Date", weekDay(d.date)],
          ["Topic", course.knowledge.has(d.topic) ? <Link href={courseHref(c, `/knowledge/${d.topic}`)}>{topicTitle(course, d.topic)}</Link> : topicTitle(course, d.topic)],
          ["Unit", d.unit ? <Link href={`${base}/syllabus`}>{`${d.unit.n} · ${d.unit.title}`}</Link> : <None />],
          ["Exercises", exercises ? `${exercises} · ${alone} alone` : <None />],
          ["Claims", claims || <None />],
          ["Open questions", questions || <None />],
        ]}
      />
      <div className={styles.kbody}>
        <Prose markdown={d.body} course={{ course: c, topics: topicIndex(course) }} />
      </div>
    </div>
  );
}
