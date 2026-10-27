import { InFlight } from "@/components/belay/in-flight";
import { CourseCard } from "@/components/course/course-card";
import course from "@/components/course/course.module.css";
import { ActivityGrid } from "@/components/home/activity-grid";
import { UsageRings } from "@/components/session/usage";
import { homeCourses } from "@/lib/course-data";
import { homeFlight, homePulse } from "@/lib/data";
import styles from "../page.module.css";

export const metadata = { title: "Home • Belay" };

/** `Saturday 24 October` */
function longDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

/**
 * Home: one column. A header with the usage rings and activity grid beside the date, then In flight and Your
 * courses, each course's card with its Up next band.
 */
export default async function HomePage() {
  const [flight, courses, pulse] = await Promise.all([homeFlight(), homeCourses(), homePulse()]);
  return (
    <div className={styles.page}>
      <header className={styles.homeHead}>
        <div>
          <h1 className={styles.homeTitle}>Home</h1>
          <p className={styles.homeDate}>{longDay(pulse.today)}</p>
        </div>
        <div className={styles.pulse}>
          <UsageRings seed={pulse.usage} />
          <ActivityGrid grid={pulse.grid} today={pulse.today} />
        </div>
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
                <CourseCard card={c} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
