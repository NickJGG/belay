import { ChevronRight } from "lucide-react";
import Link from "next/link";
import styles from "@/app/page.module.css";
import { CourseCard } from "./course-card";
import course from "./course.module.css";
import { buttonClass } from "@/components/ui/button";
import { homeCourses } from "../_lib/course-data";

/** Home's Your courses: the 3 most urgent courses' cards with their Up next bands, See all to /learn when others are hidden. */
export async function HomeCourses() {
  const courses = await homeCourses();
  if (!courses.cards.length) return null;
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h2 className={styles.sectionTitle}>Your courses</h2>
        {courses.more ? (
          <Link href="/learn" className={buttonClass("ghost", "sm")}>
            See all <ChevronRight aria-hidden />
          </Link>
        ) : null}
      </div>
      <ul className={course.cards}>
        {courses.cards.map((c) => (
          <li key={c.course.course}>
            <CourseCard card={c} />
          </li>
        ))}
      </ul>
    </section>
  );
}
