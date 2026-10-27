import type * as React from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { CourseCalendar, type CalendarSession } from "@/components/course/course-calendar";
import { action, KIND_ICON, UnitBar, UpNextButton } from "@/components/course/course-card";
import card from "@/components/course/course-card.module.css";
import course from "@/components/course/course.module.css";
import { Journey } from "@/components/course/journey";
import styles from "@/components/course/overview.module.css";
import { buttonClass } from "@/components/ui/button";
import { courseData, courseForecast, courseProgress, courseSessions } from "@/lib/course-data";
import { cardData, journeySteps, type UpNextItem, type UpNextKind } from "@/lib/course-home";
import { courseColor, getSource, today, unitFractions } from "@/lib/courses";
import { courseHref } from "@/lib/hrefs";
import { cn } from "@/lib/utils";

const SESSION_KIND: Record<string, UpNextKind> = { review: "Review", checkpoint: "Checkpoint" };

/**
 * Overview: three panels in the Goal panel's shape. Goal, with the course-colour unit bar; the current unit's
 * journey, what the topic still needs, and the next step with what follows; a calendar of sessions and cards due.
 */
export default async function OverviewTab({ params }: { params: Promise<{ c: string }> }) {
  const { c } = await params;
  const data = await courseData(c);
  if (!data) notFound();
  const [sessions, forecast] = await Promise.all([courseSessions(c), courseForecast(c)]);
  const { lead, rest, build } = cardData(data, unitFractions(data));
  const unit = data.syllabus.find((u) => u.n === data.next?.unit) ?? data.syllabus.find((u) => u.n === data.checkpoint?.unit) ?? null;
  const progress = data.next && unit?.n === data.next.unit ? await courseProgress(c, data.next.topic) : null;
  const title = (topic: string) => data.titles[topic] ?? topic;
  const then = lead && build ? [...rest, build] : rest;
  const calendar: CalendarSession[] = sessions.map((s) => {
    const kind = SESSION_KIND[s.kind] ?? "Lesson";
    return { date: s.date, kind, title: s.topics.map(title).join(", ") || kind, quiz: s.quiz, cardsAdded: s.cardsAdded, early: s.ended === "early" };
  });

  return (
    <div className={cn(course.body, styles.panels)} style={{ "--hue": courseColor(data) } as React.CSSProperties}>
      <section className={course.goal}>
        <h2 className={course.goalHeading}>Goal</h2>
        {data.goal ? <p className={course.goalText}>{data.goal}</p> : null}
        <div className={cn(course.goalFoot, styles.goalFoot)}>
          <UnitBar units={unitFractions(data)} className={card.barHome} />
          <span className={card.count}>
            <b>{data.topics.done}</b>/{data.topics.total} topics
          </span>
        </div>
      </section>

      {unit ? (
        <section className={course.goal}>
          <h2 className={cn(course.goalHeading, styles.panelHeading)}>
            Unit {unit.n} · {unit.title}
          </h2>
          <Journey steps={journeySteps(data, unit)} />
          {progress ? (
            <div className={styles.criteria}>
              <span className={styles.sub}>To finish this topic</span>
              <span className={cn(card.pill, progress.applyAlone && card.pillOk)}>{progress.applyAlone ? "✓" : "✗"} An apply exercise solved alone</span>
              <span className={cn(card.pill, progress.quizOk && card.pillOk)}>
                {progress.quizOk ? "✓" : "✗"} Quiz 4/5 or better{progress.lastQuiz ? ` · last ${progress.lastQuiz}` : ""}
              </span>
            </div>
          ) : null}
          <NextStep c={c} item={lead ?? build} />
          {then.length ? (
            <div className={styles.then}>
              <span className={styles.sub}>Then</span>
              {then.map((i) => {
                const Icon = KIND_ICON[i.kind];
                return (
                  <span key={i.kind} className={card.pill}>
                    <Icon aria-hidden />
                    {i.title}
                  </span>
                );
              })}
            </div>
          ) : null}
        </section>
      ) : null}

      <section className={course.goal}>
        <CourseCalendar sessions={calendar} forecast={forecast} today={today()} lessonsHref={courseHref(c, "/lessons")} />
      </section>
    </div>
  );
}

/** The next step under the journey: its kind chip, title and meta, and its buttons; the Build nudge has none. */
function NextStep({ c, item }: { c: string; item: UpNextItem | null }) {
  if (!item) return null;
  return (
    <div className={styles.next}>
      <span className={card.bandText}>
        <span>
          <span className={cn(card.kind, card[`kind${item.kind}`])}>{item.kind}</span>
        </span>
        <span className={card.bandTitle}>{item.title}</span>
        <span className={card.summary}>{item.kind === "Build" ? <code>/learn:build</code> : item.meta}</span>
      </span>
      {item.kind === "Build" ? null : (
        <span className={card.actions}>
          <UpNextButton item={item} label={action(item)} variant={item.kind === "Checkpoint" ? "outline" : "default"} resume />
          {item.kind === "Reading" && getSource(c, item.source!) ? (
            <Link href={courseHref(c, `/sources/${item.source}`)} className={buttonClass("outline", "sm")}>
              Open chapter
            </Link>
          ) : null}
        </span>
      )}
    </div>
  );
}
