import { WorkRows } from "@/components/session/session-list";
import { homeData } from "@/lib/data";
import styles from "../page.module.css";

export const metadata = { title: "Home — Belay" };

export default async function HomePage() {
  const { grilling, building } = await homeData();
  if (!grilling.length && !building.length) {
    return (
      <div className={styles.page}>
        <p className={styles.empty}>Nothing in progress.</p>
      </div>
    );
  }
  return (
    <div className={styles.page}>
      {grilling.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Still grilling</h2>
          <WorkRows sessions={grilling} />
        </section>
      )}
      {building.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.sectionTitle}>Building</h2>
          <WorkRows sessions={building} />
        </section>
      )}
    </div>
  );
}
