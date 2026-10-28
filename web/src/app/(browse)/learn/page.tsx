import home from "@/app/page.module.css";
import belay from "@/components/belay/belay.module.css";
import { CourseCalendar } from "@/components/course/course-calendar";
import { CourseCard } from "@/components/course/course-card";
import styles from "@/components/course/course.module.css";
import overview from "@/components/course/overview.module.css";
import { PageHeader } from "@/components/layout/page-header";
import header from "@/components/layout/page-header.module.css";
import { courseCards, learnCalendar } from "@/lib/course-data";
import { root, today } from "@/lib/courses";

export const metadata = { title: "Learn • Belay" };

/** Learn: a calendar across every course, then the course cards, most urgent first. */
export default async function LearnPage() {
  const [cards, calendar] = await Promise.all([courseCards(), learnCalendar()]);
  return (
    <div className={belay.page}>
      <PageHeader title="Learn" />
      {cards.length ? (
        <div className={overview.page}>
          <CourseCalendar sessions={calendar.sessions} due={calendar.due} today={today()} />
          <section className={home.section}>
            <h2 className={home.sectionTitle}>
              Courses<span className={header.count}>{cards.length}</span>
            </h2>
            <ul className={styles.cards}>
              {cards.map((c) => (
                <li key={c.course.course}>
                  <CourseCard card={c} extras />
                </li>
              ))}
            </ul>
          </section>
        </div>
      ) : (
        <p className={belay.empty}>
          No courses in {root()}. Build one with <code>/learn:build</code>.
        </p>
      )}
    </div>
  );
}
