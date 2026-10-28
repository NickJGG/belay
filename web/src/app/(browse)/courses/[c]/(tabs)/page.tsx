import type * as React from "react";
import { notFound } from "next/navigation";
import { CourseCalendar, type CalendarSession } from "@/components/course/course-calendar";
import course from "@/components/course/course.module.css";
import { OverviewHero } from "@/components/course/overview-hero";
import styles from "@/components/course/overview.module.css";
import { courseData, courseForecast, courseProgress, courseSessions } from "@/lib/course-data";
import { cardData, currentUnit, heroStep, journeySteps, type UpNextKind } from "@/lib/course-home";
import { courseColor, today, unitFractions } from "@/lib/courses";
import { cn } from "@/lib/utils";

const SESSION_KIND: Record<string, UpNextKind> = { review: "Review", checkpoint: "Checkpoint" };

/**
 * Overview: where am I in this course. The hero (the unit within the course, the step the unit's journey lights, the
 * journey), then a calendar of sessions and cards due, then the goal as a muted line.
 */
export default async function OverviewTab({ params }: { params: Promise<{ c: string }> }) {
  const { c } = await params;
  const data = await courseData(c);
  if (!data) notFound();
  const [sessions, forecast] = await Promise.all([courseSessions(c), courseForecast(c)]);
  const units = unitFractions(data);
  const { lead, rest, build } = cardData(data, units);
  const items = lead ? [lead, ...rest] : [];
  const n = currentUnit(data, items);
  const unit = data.syllabus.find((u) => u.n === n) ?? null;
  const progress = data.next && data.next.unit === n ? await courseProgress(c, data.next.topic) : null;
  const title = (topic: string) => data.titles[topic] ?? topic;
  const calendar: CalendarSession[] = sessions.map((s) => {
    const kind = SESSION_KIND[s.kind] ?? "Lesson";
    return { date: s.date, kind, title: s.topics.map(title).join(", ") || kind, quiz: s.quiz, cardsAdded: s.cardsAdded, early: s.ended === "early" };
  });

  return (
    <div className={cn(course.body, styles.page)} style={{ "--hue": courseColor(data) } as React.CSSProperties}>
      {unit ? (
        <OverviewHero
          course={c}
          units={units}
          current={data.syllabus.indexOf(unit)}
          unit={unit}
          hero={heroStep(data, unit, items, progress)}
          items={items}
          build={build}
          exercises={progress?.exercises ?? []}
          steps={journeySteps(data, unit)}
          lesson={!!data.next}
        />
      ) : null}
      <CourseCalendar sessions={calendar} forecast={forecast} today={today()} />
      {data.goal ? (
        <p className={styles.goal} title={data.goal}>
          <b>Goal</b>
          {data.goal}
        </p>
      ) : null}
    </div>
  );
}
