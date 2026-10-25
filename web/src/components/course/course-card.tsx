import type * as React from "react";
import Link from "next/link";
import { Flag } from "lucide-react";
import { buttonClass, type ButtonVariant } from "@/components/ui/button";
import { PALETTE } from "@/lib/course-art";
import type { CardData, UpNextItem } from "@/lib/course-home";
import { courseHref } from "@/lib/hrefs";
import { cn } from "@/lib/utils";
import { CourseTerrain } from "./course-terrain";
import { StartButton } from "./start-buttons";
import styles from "./course-card.module.css";

/** The goal's first clause: up to the first semicolon or sentence end. */
function goalLead(goal: string | null): string | null {
  if (!goal) return null;
  const lead = goal.split(/;|\. /)[0].replace(/\.$/, "");
  return `${lead}.`;
}

function action(i: UpNextItem): string {
  if (i.kind === "Review") return "Review";
  if (i.kind === "Lesson") return i.topicStatus === "in-progress" ? "Continue" : "Start";
  return "Start";
}

/** Topo's course card (grill Q7/Q21): its terrain cover, trait chips, unit bar and goal, then an Up next band with its most urgent routine. */
export function CourseCard({ card }: { card: CardData }) {
  const { course: c, units, checkpoint, lead, rest, build } = card;
  const showCheckpoint = lead?.kind !== "Checkpoint";

  const button = (i: UpNextItem, label: string, variant: ButtonVariant, resume = false) => (
    <StartButton key={i.kind} course={i.course} routine={i.routine!} label={label} className={buttonClass(variant, "sm")} resume={resume} />
  );

  return (
    <div className={styles.card} style={{ "--hue": PALETTE[c.hue] } as React.CSSProperties}>
      <span className={styles.cover}>
        <CourseTerrain slug={c.course} width={400} height={96} className={styles.terrain} />
      </span>
      {c.traits.length ? (
        <span className={styles.chips}>
          {c.traits.map((t) => (
            <span key={t} className={styles.chip}>
              {t}
            </span>
          ))}
        </span>
      ) : null}
      <Link href={courseHref(c.course)} className={styles.title}>
        {c.title}
      </Link>
      <span className={styles.barRow}>
        <span className={styles.bar} aria-hidden>
          {units.map((done, i) => (
            <i key={i} className={cn(styles.seg, done === null && styles.segOff)}>
              {done ? <b style={{ width: `${done * 100}%` }} /> : null}
            </i>
          ))}
        </span>
        <span className={styles.count}>
          <b>{c.topics.done}</b>/{c.topics.total} topics
        </span>
      </span>
      {c.goal ? <span className={styles.summary}>{goalLead(c.goal)}</span> : null}
      <div className={styles.foot}>
        {showCheckpoint ? (
          <span className={styles.pills}>
            <span className={cn(styles.pill, checkpoint.due && styles.pillOk)}>
              <Flag aria-hidden />
              {checkpoint.text}
            </span>
          </span>
        ) : null}
        {build ? (
          <span className={styles.nudge}>
            {build.title} · build it with <code>/learn:build</code>
          </span>
        ) : null}
        {lead ? (
          <div className={styles.band}>
            <span className={styles.bandText}>
              <span>
                <span className={cn(styles.kind, styles[`kind${lead.kind}`])}>{lead.kind}</span>
              </span>
              <span className={styles.bandTitle}>{lead.title}</span>
              <span className={styles.summary}>{lead.meta}</span>
            </span>
            <span className={styles.actions}>
              {button(lead, action(lead), lead.kind === "Checkpoint" ? "outline" : "default", true)}
              {lead.kind === "Lesson" && lead.due > 0 ? (
                <StartButton course={lead.course} routine="review" label="Cards only" className={buttonClass("ghost", "sm")} />
              ) : null}
              {rest.map((i) => button(i, i.kind === "Lesson" ? `${action(i)} lesson` : i.kind, i.kind === "Checkpoint" ? "outline" : "ghost"))}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
