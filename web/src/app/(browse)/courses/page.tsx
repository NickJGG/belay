import { PageHeader } from "@/components/layout/page-header";
import styles from "../../page.module.css";

export const metadata = { title: "Courses — Belay" };

/** A placeholder until Topo's courses move in (plan phase 5). */
export default function CoursesPage() {
  return (
    <>
      <PageHeader title="Courses" />
      <p className={styles.empty}>
        Courses move in from Topo soon. Until then they&apos;re at <a href="http://127.0.0.1:3100/courses">Topo</a>.
      </p>
    </>
  );
}
