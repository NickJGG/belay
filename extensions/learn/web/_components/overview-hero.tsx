import type * as React from "react";
import { StatusIcon } from "@/components/belay/status-icon";
import { buttonClass } from "@/components/ui/button";
import tips from "@/components/ui/tip.module.css";
import { exerciseRows, type HeroStep, type JourneyStep, type UpNextItem } from "../_lib/course-home";
import type { ExerciseOutcome, TopicProgress, Unit } from "../_lib/courses";
import { cn } from "@/lib/utils";
import { action, UnitBar, UpNextButton } from "./course-card";
import card from "./course-card.module.css";
import { CourseTerrain } from "@/components/course/course-terrain";
import { Journey } from "./journey";
import { MarkRead } from "./mark-read";
import { StartButton } from "./start-buttons";
import styles from "./overview.module.css";

type Status = React.ComponentProps<typeof StatusIcon>["status"];
type Exercises = TopicProgress["exercises"];

const MARK: Record<ExerciseOutcome | "none", { status: Status; label: string; className: string }> = {
  "with hints": { status: "doing", label: "With hints", className: styles.hints },
  alone: { status: "done", label: "Alone", className: styles.alone },
  none: { status: "todo", label: "Not tried", className: styles.untried },
  "not solved": { status: "dropped", label: "Not solved", className: styles.unsolved },
};

function Mark({ outcome }: { outcome: ExerciseOutcome | "none" }) {
  const m = MARK[outcome];
  return (
    <span className={cn(styles.mark, m.className)}>
      <StatusIcon status={m.status} size={12} label={m.label} />
    </span>
  );
}

/** The exercises that count, one row per kind, numbered without the `e`, with a legend of the outcomes shown. */
function ExerciseTip({ exercises }: { exercises: Exercises }) {
  const legend: (ExerciseOutcome | "none")[] = ["with hints", "alone", "none"];
  if (exercises.some((e) => e.outcome === "not solved")) legend.push("not solved");
  return (
    <>
      <span className={styles.tipHead}>Exercises</span>
      {exerciseRows(exercises).map((row) => (
        <span key={row.kind} className={styles.kindRow}>
          <span className={styles.kindName}>{row.kind[0].toUpperCase() + row.kind.slice(1)}</span>
          <span className={styles.kindNums}>
            {row.items.map((i) => (
              <span key={i.n} className={styles.num}>
                <Mark outcome={i.outcome ?? "none"} />
                <b>{i.n}</b>
              </span>
            ))}
          </span>
        </span>
      ))}
      <span className={styles.tipLegend}>
        {legend.map((o) => (
          <span key={o}>
            <Mark outcome={o} />
            {MARK[o].label}
          </span>
        ))}
      </span>
    </>
  );
}

function SectionsTip({ sections }: { sections: string[] }) {
  return (
    <>
      <span className={styles.tipHead}>Sections</span>
      {sections.map((s) => (
        <span key={s}>{s}</span>
      ))}
    </>
  );
}

/** A pill with a status icon, tinted when met; `tip` drops below it on hover or focus. */
function StatusChip({
  status,
  label,
  detail = null,
  met,
  tip,
}: {
  status: Status;
  label: string;
  detail?: string | null;
  met: boolean;
  tip?: React.ReactNode;
}) {
  return (
    <span className={cn(styles.chip, met && styles.chipMet, tip ? tips.tipped : null)} tabIndex={tip ? 0 : undefined}>
      <StatusIcon status={status} size={15} label={met ? "Met" : "Not yet"} />
      {label}
      {detail ? <small>{detail}</small> : null}
      {tip ? <span className={cn(tips.tip, tips.tipDown, styles.heroTip)}>{tip}</span> : null}
    </span>
  );
}

function Body({ kind, title, line, children, actions }: { kind: string; title: string; line: React.ReactNode; children?: React.ReactNode; actions: React.ReactNode }) {
  return (
    <div className={styles.heroBody}>
      <div className={styles.heroText}>
        <span className={styles.eyebrow}>Up next · {kind}</span>
        <h2 className={styles.heroTitle}>{title}</h2>
        {line ? <p className={styles.heroLine}>{line}</p> : null}
        {children}
      </div>
      {actions ? <div className={styles.heroActions}>{actions}</div> : null}
    </div>
  );
}

/** A routine's button: the lead's action with its kind (Continue lesson, Start checkpoint), Review alone. */
function RoutineButton({ item }: { item: UpNextItem }) {
  const label = item.kind === "Review" ? action(item) : `${action(item)} ${item.kind.toLowerCase()}`;
  return <UpNextButton item={item} label={label} variant="default" resume />;
}

function HeroMain({ course, hero, items, build, exercises, lesson }: Omit<Props, "units" | "current" | "unit" | "steps">) {
  const lead = items[0] ?? null;
  if (hero?.kind === "reading") {
    const reading = items.find((i) => i.kind === "Reading");
    return (
      <Body
        kind="Reading"
        title={hero.title}
        line={hero.line}
        actions={
          <>
            {reading?.source ? <MarkRead course={course} source={reading.source} /> : null}
            {lesson ? <StartButton course={course} routine="lesson" label="Start lesson anyway" className={buttonClass("outline", "sm")} resume /> : null}
          </>
        }
      >
        <div className={styles.books}>
          {hero.books?.map((b) => (
            <div key={b.book ?? ""} className={styles.bookRow}>
              {b.book ? <span className={styles.bookName}>{b.book}</span> : null}
              {b.chapters.map((ch) => (
                <StatusChip
                  key={ch.source}
                  status={ch.status === "done" ? "done" : "todo"}
                  label={ch.label}
                  met={ch.status === "done"}
                  tip={ch.sections.length ? <SectionsTip sections={ch.sections} /> : undefined}
                />
              ))}
            </div>
          ))}
        </div>
      </Body>
    );
  }
  if (hero) {
    const item = hero.kind === "checkpoint" ? items.find((i) => i.kind === "Checkpoint") : lead;
    return (
      <Body kind={item?.kind ?? "Lesson"} title={hero.title} line={hero.line} actions={item ? <RoutineButton item={item} /> : null}>
        {hero.chips.length ? (
          <div className={styles.chips}>
            {hero.chips.map((c) => (
              <StatusChip
                key={c.label}
                status={c.met ? "done" : "doing"}
                label={c.label}
                detail={c.detail}
                met={c.met}
                tip={c.tip === "exercises" && exercises.length ? <ExerciseTip exercises={exercises} /> : undefined}
              />
            ))}
          </div>
        ) : null}
      </Body>
    );
  }
  const item = lead ?? build;
  if (!item) return null;
  return (
    <Body
      kind={item.kind}
      title={item.title}
      line={
        item.kind === "Build" ? (
          <>
            Build it with <code>/learn:build</code>
          </>
        ) : (
          item.meta
        )
      }
      actions={item.kind === "Build" ? null : <RoutineButton item={item} />}
    />
  );
}

type Props = {
  course: string;
  /** The course's `unitFractions`, and the index of `unit` in it. */
  units: (number | null)[];
  current: number;
  unit: Unit;
  /** `heroStep`'s step, or null for the lead (or the Build nudge) as it stands. */
  hero: HeroStep | null;
  /** The card's routines, lead first. */
  items: UpNextItem[];
  build: UpNextItem | null;
  exercises: Exercises;
  steps: JourneyStep[];
  /** A lesson is ready, so reading offers Start lesson anyway. */
  lesson: boolean;
};

/**
 * The Overview's hero, in the course card's language: the unit within the course (chip and unit bar), the step the
 * journey lights (a topic with its finish chips, the unit's reading by book, or a due checkpoint) and its buttons,
 * then the unit's journey along the foot.
 */
export function OverviewHero({ units, current, unit, steps, ...main }: Props) {
  return (
    <section className={styles.hero}>
      <span className={styles.heroArt} aria-hidden>
        <span className={card.homeArtFade}>
          <span className={card.homeArt}>
            <CourseTerrain slug={main.course} width={860} height={130} />
          </span>
        </span>
      </span>
      <div className={styles.heroCourse}>
        <span className={card.chip}>
          Unit {unit.n} of {units.length} · {unit.title}
        </span>
        <UnitBar units={units} current={current} className={cn(card.barHome, styles.heroBar)} />
      </div>
      <HeroMain {...main} />
      <div className={styles.heroJourney}>
        <Journey steps={steps} />
      </div>
    </section>
  );
}
