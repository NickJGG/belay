import { CourseCard } from "@/components/course/course-card";
import styles from "@/components/course/course.module.css";
import belay from "@/components/belay/belay.module.css";
import { PageHeader } from "@/components/layout/page-header";
import { courseCards } from "@/lib/course-data";
import { root } from "@/lib/courses";

export const metadata = { title: "Courses • Belay" };

/** Courses: the list header, then the course cards, most urgent first. */
export default async function CoursesPage() {
  const cards = await courseCards();
  return (
    <div className={belay.page}>
      <PageHeader title="Courses" count={cards.length} />
      {cards.length ? (
        <ul className={styles.cards}>
          {cards.map((c) => (
            <li key={c.course.course}>
              <CourseCard card={c} />
            </li>
          ))}
        </ul>
      ) : (
        <p className={belay.empty}>
          No courses in {root()}. Build one with <code>/learn:build</code>.
        </p>
      )}
    </div>
  );
}
