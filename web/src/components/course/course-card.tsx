import type * as React from "react";
import Link from "next/link";
import { BookOpen, Clock, Flag, Hammer, Layers, Play, type LucideIcon } from "lucide-react";
import { workDay } from "../../../../src/workday.ts";
import { buttonClass, type ButtonVariant } from "@/components/ui/button";
import tips from "@/components/ui/tip.module.css";
import { dayLabel } from "@/lib/belay-view";
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

const KIND_ICON: Record<UpNextKind, LucideIcon> = { Lesson: Play, Reading: BookOpen, Review: Layers, Checkpoint: Flag, Build: Hammer };

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

function Pill({ icon: Icon, tip, className, children }: { icon: LucideIcon; tip: string; className?: string; children: React.ReactNode }) {
  return (
    <span className={cn(styles.pill, tips.tipped, className)} tabIndex={0}>
      <Icon aria-hidden />
      {children}
      <span className={tips.tip}>{tip}</span>
    </span>
  );
}

/** Cards due and the last lesson's day, each left out when there's none. */
function CardPills({ due, lastLesson }: { due: number; lastLesson: string | null }) {
  if (!due && !lastLesson) return null;
  return (
    <span className={cn(styles.pills, styles.cardPills)}>
      {due > 0 ? (
        <Pill icon={Layers} tip="Due for review" className={styles.pillHue}>
          {due} {due === 1 ? "card" : "cards"} due
        </Pill>
      ) : null}
      {lastLesson ? (
        <Pill icon={Clock} tip="Last lesson">
          {dayLabel(lastLesson, workDay())}
        </Pill>
      ) : null}
    </span>
  );
}

/** `current` is the index of the unit to outline. */
export function UnitBar({ units, current, className }: { units: (number | null)[]; current?: number; className?: string }) {
  return (
    <span className={cn(styles.bar, className)} aria-hidden>
      {units.map((done, i) => (
        <i key={i} className={cn(styles.seg, done === null && styles.segOff, i === current && styles.segCur)}>
          {done ? <b style={{ width: `${done * 100}%` }} /> : null}
        </i>
      ))}
    </span>
  );
}

/**
 * A course card: faded terrain behind the head, trait chips, title, a course-colour bar, and one row with the lead's
 * kind icon, title and button, or the Build nudge when nothing is actionable. Under the bar, pills for cards due and
 * the last lesson; `extras` (/courses) adds the goal's first clause under them, clamped to two lines.
 */
export function CourseCard({ card, extras = false }: { card: CardData; extras?: boolean }) {
  const { course: c, units, lead, build } = card;
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
      <CardPills due={c.cards.due} lastLesson={card.lastLesson} />
      {extras && c.goal ? <span className={cn(styles.summary, styles.goal)}>{goalLead(c.goal)}</span> : null}
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
          {lead ? (
            <span className={styles.actions}>
              <UpNextButton item={lead} label={action(lead)} variant={lead.kind === "Checkpoint" ? "outline" : "default"} resume />
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
