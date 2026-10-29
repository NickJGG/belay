import type { GridDay } from "../../../../src/home.ts";
import { cn } from "@/lib/utils";
import tips from "@/components/ui/tip.module.css";
import styles from "./home.module.css";

const LETTERS = ["S", "M", "T", "W", "T", "F", "S"];
const LEVELS = [styles.l0, styles.l1, styles.l2, styles.l3, styles.l4];

/** `Sun 25` */
function shortDay(day: string) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-GB", { weekday: "short", day: "numeric" });
}

function summary({ done, extra }: GridDay) {
  const parts = [done && `${done} done`, ...extra.map((e) => e.n && `${e.n} ${e.noun}`)].filter(Boolean);
  return parts.length ? parts.join(" · ") : "Nothing";
}

/** Home's last two weeks, Sunday first: one square a day, shaded by `activityGrid`'s level, with a tip. */
export function ActivityGrid({ grid, today }: { grid: GridDay[]; today: string }) {
  return (
    <span className={styles.grid} role="group" aria-label="Activity, last week and this week">
      <span className={styles.days} aria-hidden>
        {LETTERS.map((x, i) => (
          <small key={i}>{x}</small>
        ))}
      </span>
      <span className={styles.cells}>
        {grid.map((d) =>
          d.future ? (
            <i key={d.day} className={styles.future} />
          ) : (
            <i
              key={d.day}
              className={cn(LEVELS[d.level], d.day === today && styles.today, tips.tipped)}
              tabIndex={0}
              role="img"
              aria-label={`${shortDay(d.day)}: ${summary(d)}`}
            >
              <span className={cn(tips.tip, styles.tip)} aria-hidden>
                <b>{shortDay(d.day)}</b>
                {summary(d)}
              </span>
            </i>
          ),
        )}
      </span>
    </span>
  );
}
