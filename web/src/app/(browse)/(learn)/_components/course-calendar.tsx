"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronLeft, ChevronRight, Layers, Play } from "lucide-react";
import belay from "@/components/belay/belay.module.css";
import { Button } from "@/components/ui/button";
import { dayLabel, monthGrid, monthOf, monthTitle, shiftMonth } from "@/app/(browse)/(learn)/_lib/calendar";
import type { CalendarDue, CalendarSession, CourseTag } from "@/app/(browse)/(learn)/_lib/course-home";
import { courseHref } from "@/app/(browse)/(learn)/_lib/hrefs";
import { cn } from "@/lib/utils";
import card from "./course-card.module.css";
import course from "./course.module.css";
import styles from "./overview.module.css";

const WEEKDAYS = ["S", "M", "T", "W", "T", "F", "S"];

const Kind = ({ kind }: { kind: string }) => <span className={cn(card.kind, card[`kind${kind}`])}>{kind}</span>;

const hue = (c?: CourseTag) => (c ? ({ "--hue": c.hue } as React.CSSProperties) : undefined);

const Tag = ({ course }: { course?: CourseTag }) =>
  course ? (
    <Link href={courseHref(course.slug)} className={styles.courseTag} style={hue(course)}>
      {course.title}
    </Link>
  ) : null;

/**
 * A Sunday-first month in square days: a dot per logged session, a cards count on days cards fall due, today
 * outlined. It opens on today; clicking a day lists its sessions and cards beside the grid (under it on phones).
 * Entries tagged with a course (Learn's calendar across courses) take its hue and link to it.
 */
export function CourseCalendar({ sessions, due, today }: { sessions: CalendarSession[]; due: CalendarDue; today: string }) {
  const [month, setMonth] = React.useState(() => monthOf(today));
  const [picked, setPicked] = React.useState(today);
  const byDay = React.useMemo(() => {
    const m = new Map<string, CalendarSession[]>();
    for (const s of sessions) m.set(s.date, [...(m.get(s.date) ?? []), s]);
    return m;
  }, [sessions]);
  const daySessions = byDay.get(picked) ?? [];
  const dayDue = due[picked] ?? [];

  return (
    <section>
      <div className={styles.headRow}>
        <h2 className={course.goalHeading}>{monthTitle(month, today)}</h2>
        <Button variant="ghost" size="icon-sm" aria-label="Previous month" onClick={() => setMonth((m) => shiftMonth(m, -1))}>
          <ChevronLeft size={16} aria-hidden />
        </Button>
        <Button variant="ghost" size="icon-sm" aria-label="Next month" onClick={() => setMonth((m) => shiftMonth(m, 1))}>
          <ChevronRight size={16} aria-hidden />
        </Button>
      </div>
      <div className={styles.calRow}>
        <div className={styles.grid}>
          {WEEKDAYS.map((d, i) => (
            <span key={i} className={styles.weekday} aria-hidden>
              {d}
            </span>
          ))}
          {monthGrid(month).map((day, i) => {
            if (!day) return <span key={i} />;
            const ds = byDay.get(day) ?? [];
            const cards = (due[day] ?? []).reduce((sum, d) => sum + d.n, 0);
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
                {ds.length ? (
                  <span className={styles.dots}>
                    {ds.map((s, j) => (
                      <i key={j} className={styles.sessionDot} style={hue(s.course)} />
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
          {daySessions.length || dayDue.length ? (
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
                  <Tag course={s.course} />
                </li>
              ))}
              {dayDue.map((d, i) => (
                <li key={`due-${i}`} className={belay.row}>
                  <Kind kind="Review" />
                  <span className={belay.grow}>
                    {d.n} card{d.n === 1 ? "" : "s"} due
                  </span>
                  <Tag course={d.course} />
                </li>
              ))}
            </ul>
          ) : (
            <p className={belay.empty}>No sessions.</p>
          )}
        </div>
      </div>
    </section>
  );
}
