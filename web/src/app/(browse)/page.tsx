import { Activity } from "@/components/belay/activity";
import { InFlight } from "@/components/belay/in-flight";
import { ActivityGrid } from "@/components/home/activity-grid";
import { UsageRings } from "@/components/session/usage";
import { WEEK, windowDays } from "@/lib/belay-view";
import { homeActivity, homeFlight, homePulse } from "@/lib/data";
import { homeSections } from "@/lib/extensions.server";
import styles from "../page.module.css";

export const metadata = { title: "Home • Belay" };

/** `Saturday 24 October` */
function longDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" });
}

/**
 * Home: one column. A header with the usage rings and activity grid beside the date, then In flight, the active
 * extensions' sections, and Recent activity: issues done across projects, a week more per Show earlier.
 */
export default async function HomePage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = windowDays((await searchParams).days);
  const [flight, sections, pulse, recent] = await Promise.all([homeFlight(), homeSections(), homePulse(), homeActivity(days)]);
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
      {sections.map(({ id, Section }) => (
        <Section key={id} />
      ))}
      <section className={styles.section}>
        <h2 className={styles.sectionTitle}>Recent activity</h2>
        <Activity feed={recent.feed} today={recent.today} scope="home" earlierHref={`/?days=${days + WEEK}`} marks={recent.marks} />
      </section>
    </div>
  );
}
