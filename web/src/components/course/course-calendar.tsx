"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Layers, Play } from "lucide-react";
import belay from "@/components/belay/belay.module.css";
import { Button } from "@/components/ui/button";
import { dayLabel, monthGrid, monthOf, monthTitle, shiftMonth } from "@/lib/calendar";
import type { UpNextKind } from "@/lib/course-home";
import { cn } from "@/lib/utils";
import card from "./course-card.module.css";
import course from "./course.module.css";
import styles from "./overview.module.css";

export type CalendarSession = {
  date: string;
  kind: UpNextKind;
  /** The session's topics by title. */
  title: string;
  quiz: string | null;
  cardsAdded: number | null;
  early: boolean;
};

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const Kind = ({ kind }: { kind: string }) => <span className={cn(card.kind, card[`kind${kind}`])}>{kind}</span>;

/**
 * A Sunday-first month of the course: a dot per logged session, a cards count on days cards fall due, today
 * outlined. It opens on today; clicking a day lists its sessions and cards under the grid.
 */
export function CourseCalendar({
  sessions,
  forecast,
  today,
  lessonsHref,
}: {
  sessions: CalendarSession[];
  forecast: Record<string, number>;
  today: string;
  lessonsHref: string;
}) {
  const [month, setMonth] = React.useState(() => monthOf(today));
  const [picked, setPicked] = React.useState(today);
  const byDay = React.useMemo(() => {
    const m = new Map<string, CalendarSession[]>();
    for (const s of sessions) m.set(s.date, [...(m.get(s.date) ?? []), s]);
    return m;
  }, [sessions]);
  const daySessions = byDay.get(picked) ?? [];
  const due = forecast[picked] ?? 0;

  return (
    <>
      <div className={styles.headRow}>
        <h2 className={course.goalHeading}>{monthTitle(month, today)}</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
          <ChevronLeft size={16} aria-hidden />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
          <ChevronRight size={16} aria-hidden />
        </Button>
      </div>
      <div className={styles.grid}>
        {WEEKDAYS.map((d, i) => (
          <span key={i} className={styles.weekday} aria-hidden>
            {d}
          </span>
        ))}
        {monthGrid(month).map((day, i) => {
          if (!day) return <span key={i} />;
          const n = byDay.get(day)?.length ?? 0;
          const cards = forecast[day];
          return (
            <button
              key={day}
              type="button"
              className={cn(styles.day, day > today && styles.future, day === today && styles.today, day === picked && styles.picked)}
              aria-pressed={day === picked}
              aria-label={dayLabel(day, today)}
              onClick={() => setPicked(day)}
            >
              <span>{+day.slice(8)}</span>
              {n ? (
                <span className={styles.dots}>
                  {Array.from({ length: n }, (_, j) => (
                    <i key={j} className={styles.sessionDot} />
                  ))}
                </span>
              ) : null}
              {cards ? (
                <span className={styles.due}>
                  <Layers aria-hidden />
                  {cards}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>
      <div className={styles.detail}>
        <h3 className={styles.detailHeading}>{dayLabel(picked, today)}</h3>
        {daySessions.length || due ? (
          <ul className={belay.rows}>
            {daySessions.map((s, i) => (
              <li key={i} className={belay.row}>
                <Kind kind={s.kind} />
                <span className={belay.grow}>{s.title}</span>
                <span className={card.pills}>
                  {s.quiz ? (
                    <span className={card.pill}>
                      <Play aria-hidden />
                      Quiz {s.quiz}
                    </span>
                  ) : null}
                  {s.cardsAdded ? (
                    <span className={card.pill}>
                      <Layers aria-hidden />
                      {s.cardsAdded} cards added
                    </span>
                  ) : null}
                  {s.early ? <span className={card.pill}>Ended early</span> : null}
                </span>
              </li>
            ))}
            {due ? (
              <li className={belay.row}>
                <Kind kind="Review" />
                <span className={belay.grow}>
                  {due} card{due === 1 ? "" : "s"} due
                </span>
              </li>
            ) : null}
          </ul>
        ) : (
          <p className={belay.empty}>No sessions.</p>
        )}
      </div>
      <div className={cn(course.goalFoot, styles.goalFoot)}>
        <span className={styles.legend}>
          <i className={styles.sessionDot} /> Session
          <span className={styles.due}>
            <Layers aria-hidden />
          </span>
          Cards due
        </span>
        <Link href={lessonsHref} className={styles.footLink}>
          All lessons →
        </Link>
      </div>
    </>
  );
}
