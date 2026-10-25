import Link from "next/link";
import { notFound } from "next/navigation";
import { Diamond } from "lucide-react";
import { Group } from "@/components/belay/group";
import belay from "@/components/belay/belay.module.css";
import styles from "@/components/course/course.module.css";
import { checkpointText, TopicIcon } from "@/components/course/topic-icon";
import { courseData } from "@/lib/course-data";
import { courseHref } from "@/lib/hrefs";
import { cn } from "@/lib/utils";

/**
 * Syllabus: the Goal panel, then a collapsible group per unit (bare number, title, "not built yet" when
 * unbuilt), the unit in progress open. Topic rows carry belay's status icons; the checkpoint row comes last.
 */
export default async function SyllabusTab({ params }: { params: Promise<{ c: string }> }) {
  const { c } = await params;
  const course = await courseData(c);
  if (!course) notFound();
  const next = course.syllabus.find((u) => u.checkpoint?.result !== "pass");
  const current = course.next?.unit ?? next?.n;
  return (
    <div className={styles.body}>
      {course.goal ? (
        <section className={styles.goal}>
          <h2 className={styles.goalHeading}>Goal</h2>
          <p className={styles.goalText}>{course.goal}</p>
          <p className={styles.goalFoot}>
            {[
              `${course.ready.length} of ${course.units} units ready`,
              `${course.topics.done}/${course.topics.total} topics`,
              next ? `Next: Checkpoint ${next.n}` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </section>
      ) : null}
      <div className={styles.units}>
        {course.syllabus.map((u) => {
          const ready = course.ready.includes(u.n);
          return (
            <Group
              key={u.n}
              id={`${c}:unit:${u.n}`}
              label={
                <>
                  <span className={styles.unum}>{u.n}</span> {u.title}
                </>
              }
              count={ready ? undefined : "not built yet"}
              defaultOpen={u.n === current}
              className={cn(!ready && styles.locked)}
              headClassName={styles.unitHead}
            >
              <ul className={belay.rows}>
                {u.topics.map((t) => (
                  <li key={t.topic} className={belay.row}>
                    <TopicIcon status={t.status} />
                    {ready && course.knowledge.has(t.topic) ? (
                      <Link href={courseHref(c, `/knowledge/${t.topic}`)} className={cn(belay.grow, belay.stretch)}>
                        {t.topic}
                      </Link>
                    ) : (
                      <span className={belay.grow}>{t.topic}</span>
                    )}
                  </li>
                ))}
                <li className={cn(belay.row, styles.checkpoint)}>
                  <Diamond size={13} aria-hidden />
                  <span className={belay.grow}>Checkpoint {u.n}</span>
                  <span className={belay.side}>{checkpointText(u.checkpoint)}</span>
                </li>
              </ul>
            </Group>
          );
        })}
      </div>
    </div>
  );
}
