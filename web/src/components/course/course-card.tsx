import type * as React from "react";
import Link from "next/link";
import { BookOpen, Flag, Hammer, Layers, Play, type LucideIcon } from "lucide-react";
import { buttonClass, type ButtonVariant } from "@/components/ui/button";
import { PALETTE } from "@/lib/course-art";
import type { CardData, UpNextItem, UpNextKind } from "@/lib/course-home";
import { courseHref } from "@/lib/hrefs";
import { cn } from "@/lib/utils";
import { CourseTerrain } from "./course-terrain";
import { MarkRead } from "./mark-read";
import { StartButton } from "./start-buttons";
import styles from "./course-card.module.css";

/** The goal's first clause: up to the first semicolon or sentence end. */
function goalLead(goal: string | null): string | null {
  if (!goal) return null;
  const lead = goal.split(/;|\. /)[0].replace(/\.$/, "");
  return `${lead}.`;
}

export function action(i: UpNextItem): string {
  if (i.kind === "Review") return "Review";
  if (i.kind === "Lesson") return i.topicStatus === "in-progress" ? "Continue" : "Start";
  return "Start";
}

/** A secondary button's label, which names what it starts. */
export const restLabel = (i: UpNextItem) => (i.kind === "Lesson" ? `${action(i)} lesson` : i.kind);

export const KIND_ICON: Record<UpNextKind, LucideIcon> = { Lesson: Play, Reading: BookOpen, Review: Layers, Checkpoint: Flag, Build: Hammer };

/** An Up next item's button: Mark read for reading, otherwise its routine's start. */
export function UpNextButton({ item, label, variant, resume = false }: { item: UpNextItem; label: string; variant: ButtonVariant; resume?: boolean }) {
  if (item.kind === "Reading") return <MarkRead course={item.course} source={item.source!} variant={variant} />;
  return <StartButton course={item.course} routine={item.routine!} label={label} className={buttonClass(variant, "sm")} resume={resume} />;
}

function Chips({ traits }: { traits: string[] }) {
  if (!traits.length) return null;
  return (
    <span className={styles.chips}>
      {traits.map((t) => (
        <span key={t} className={styles.chip}>
          {t}
        </span>
      ))}
    </span>
  );
}

export function UnitBar({ units, className }: { units: (number | null)[]; className?: string }) {
  return (
    <span className={cn(styles.bar, className)} aria-hidden>
      {units.map((done, i) => (
        <i key={i} className={cn(styles.seg, done === null && styles.segOff)}>
          {done ? <b style={{ width: `${done * 100}%` }} /> : null}
        </i>
      ))}
    </span>
  );
}

/**
 * A course card. `full` (/courses): terrain cover, trait chips, unit bar and goal, then an Up next band with its
 * most urgent routine. `home`: faded terrain behind the head, a course-colour bar, and one row with the lead's
 * kind icon, title and button, or the Build nudge when nothing is actionable.
 */
export function CourseCard({ card, variant = "full" }: { card: CardData; variant?: "full" | "home" }) {
  const { course: c, units, checkpoint, lead, rest, build } = card;
  const showCheckpoint = lead?.kind !== "Checkpoint";

  const button = (i: UpNextItem, label: string, variant: ButtonVariant, resume = false) => (
    <UpNextButton key={i.kind} item={i} label={label} variant={variant} resume={resume} />
  );

  if (variant === "home") {
    const next = lead ?? build;
    const Icon = next ? KIND_ICON[next.kind] : null;
    return (
      <div className={cn(styles.card, styles.homeCard)} style={{ "--hue": PALETTE[c.hue] } as React.CSSProperties}>
        <span className={styles.homeArtFade} aria-hidden>
          <span className={styles.homeArt}>
            <CourseTerrain slug={c.course} width={400} height={130} />
          </span>
        </span>
        <Chips traits={c.traits} />
        <Link href={courseHref(c.course)} className={styles.title}>
          {c.title}
        </Link>
        <UnitBar units={units} className={styles.barHome} />
        {next && Icon ? (
          <div className={styles.nextRow}>
            <Icon className={styles.nextIcon} aria-label={next.kind} />
            <span className={styles.nextTitle}>
              {lead ? (
                lead.title
              ) : (
                <>
                  {next.title} · <code>/learn:build</code>
                </>
              )}
            </span>
            {lead ? <span className={styles.actions}>{button(lead, action(lead), lead.kind === "Checkpoint" ? "outline" : "default", true)}</span> : null}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.card} style={{ "--hue": PALETTE[c.hue] } as React.CSSProperties}>
      <span className={styles.cover}>
        <CourseTerrain slug={c.course} width={400} height={96} className={styles.terrain} />
      </span>
      <Chips traits={c.traits} />
      <Link href={courseHref(c.course)} className={styles.title}>
        {c.title}
      </Link>
      <span className={styles.barRow}>
        <UnitBar units={units} />
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
              {rest.map((i) => button(i, restLabel(i), i.kind === "Checkpoint" ? "outline" : "ghost"))}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
