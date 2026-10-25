import Link from "next/link";
import { InFlight } from "@/components/belay/in-flight";
import { homeFlight } from "@/lib/data";
import { workDay } from "../../../../src/workday.ts";
import styles from "../page.module.css";

export const metadata = { title: "Home — Belay" };

/** `Saturday 24 October` */
function longDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

/** Home (grill Q7): one column, In flight then Your courses. */
export default async function HomePage() {
  const rows = await homeFlight();
  return (
    <div className={styles.page}>
      <header>
        <h1 className={styles.homeTitle}>Home</h1>
        <p className={styles.homeDate}>{longDay(workDay())}</p>
      </header>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>In flight</h2>
        <InFlight rows={rows} />
      </section>
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Your courses</h2>
        <p className={styles.homeNote}>
          Courses move in from Topo soon. Until then they&apos;re on <Link href="/courses">Courses</Link>.
        </p>
      </section>
    </div>
  );
}
