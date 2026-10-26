import { InFlight } from "@/components/belay/in-flight";
import { CourseCard } from "@/components/course/course-card";
import course from "@/components/course/course.module.css";
import { homeCourses } from "@/lib/course-data";
import { homeFlight } from "@/lib/data";
import { workDay } from "../../../../src/workday.ts";
import styles from "../page.module.css";

export const metadata = { title: "Home • Belay" };

/** `Saturday 24 October` */
function longDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

/** Home: one column, In flight then Your courses, each course's card with its Up next band. */
export default async function HomePage() {
  const [flight, courses] = await Promise.all([homeFlight(), homeCourses()]);
  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.homeTitle}>Home</h1>
        <p className={styles.homeDate}>{longDay(workDay())}</p>
      </header>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>In flight</h2>
        <InFlight {...flight} />
      </section>
      {courses.length ? (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Your courses</h2>
          <ul className={course.cards}>
            {courses.map((c) => (
              <li key={c.course.course}>
                <CourseCard card={c} variant="home" />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
