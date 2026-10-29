import type * as React from "react";
import { notFound } from "next/navigation";
import { CourseCalendar } from "../../../_components/course-calendar";
import course from "../../../_components/course.module.css";
import { OverviewHero } from "../../../_components/overview-hero";
import styles from "../../../_components/overview.module.css";
import { courseData, courseForecast, courseProgress, courseSessions } from "../../../_lib/course-data";
import { calendarSessions, cardData, currentUnit, heroStep, journeySteps, mergeDue } from "../../../_lib/course-home";
import { courseColor, today, unitFractions } from "../../../_lib/courses";
import { cn } from "@/lib/utils";

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
      <CourseCalendar sessions={calendarSessions(data, sessions)} due={mergeDue([{ forecast }])} today={today()} />
      {data.goal ? (
        <p className={styles.goal} title={data.goal}>
          <b>Goal</b>
          {data.goal}
        </p>
      ) : null}
    </div>
  );
}
