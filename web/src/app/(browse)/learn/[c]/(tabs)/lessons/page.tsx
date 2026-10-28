import Link from "next/link";
import { notFound } from "next/navigation";
import belay from "@/components/belay/belay.module.css";
import styles from "@/components/course/course.module.css";
import { courseData } from "@/lib/course-data";
import { listLessons, topicTitle } from "@/lib/courses";
import { shortDate } from "@/lib/format";
import { courseHref } from "@/lib/hrefs";
import { cn } from "@/lib/utils";

/**
 * Lessons, listed like a project's grills: full-height hairline rows, a dot, the date in a fixed column,
 * the title, then the topic at the right. The row opens the lesson note. Live lessons arrive with the one bridge.
 */
export default async function LessonsTab({ params }: { params: Promise<{ c: string }> }) {
  const { c } = await params;
  const course = await courseData(c);
  if (!course) notFound();
  const lessons = listLessons(c);
  if (!lessons.length) return <p className={belay.empty}>No lessons yet. Each /learn session adds a lesson note here.</p>;
  return (
    <ul className={cn(belay.rows, styles.body)}>
      {lessons.map((l) => (
        <li key={l.slug} className={belay.row} title={l.slug}>
          <span className={belay.dot} aria-hidden />
          <span className={belay.date}>{shortDate(l.date)}</span>
          <Link href={courseHref(c, `/lessons/${l.slug}`)} className={cn(belay.grow, belay.stretch)}>
            {l.title}
          </Link>
          <span className={styles.lead}>{topicTitle(course, l.topic)}</span>
        </li>
      ))}
    </ul>
  );
}
