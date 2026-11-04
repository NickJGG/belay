import {
  checkpointLabel,
  keptParts,
  topicTitle,
  unitFractions,
  type CourseSummary,
  type ExerciseKind,
  type Overview,
  type Reading,
  type Rung,
  type Session,
  type TopicProgress,
  type TopicStatus,
  type Unit,
} from "./courses.ts";
import type { Routine } from "./routines.ts";

/*
 * The course cards: one per course, with an Up next band led by the course's most urgent routine.
 */

export type UpNextKind = "Review" | "Checkpoint" | "Reading" | "Lesson" | "Build";

export type UpNextItem = {
  kind: UpNextKind;
  course: string;
  courseTitle: string;
  title: string;
  meta: string;
  /** The routine the band's button starts; none for Reading (marked read instead) or the Build nudge. */
  routine?: Routine;
  /** Reading's source id, for Mark read and Open chapter. */
  source?: string;
  topicStatus?: TopicStatus;
  due: number;
};

export type CardData = {
  course: CourseSummary;
  /** Per syllabus unit: the fraction of its topics done, or null when it isn't built. */
  units: (number | null)[];
  checkpoint: { text: string; due: boolean };
  /** The band's routine; null when nothing is actionable. */
  lead: UpNextItem | null;
  /** The other routines, offered as secondary buttons. */
  rest: UpNextItem[];
  build: UpNextItem | null;
  /** The lead's index in ORDER; lower is more urgent. */
  urgency: number;
  /** The newest lesson's date; null for a course never studied. */
  lastLesson: string | null;
};

/** More due cards than a lesson's opening review takes. */
const LESSON_CARDS = 20;

const ORDER: UpNextKind[] = ["Review", "Checkpoint", "Reading", "Lesson", "Build"];

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

function upNext(c: CourseSummary): UpNextItem[] {
  const base = { course: c.course, courseTitle: c.title, due: c.cards.due };
  const items: UpNextItem[] = [];
  const due = c.cards.due;

  if ((!c.next && due > 0) || due > LESSON_CARDS) {
    items.push({
      ...base,
      kind: "Review",
      title: `${plural(due, "card")} due`,
      meta: c.next ? `${due} due, a lesson reviews ${LESSON_CARDS}` : "No lesson ready",
      routine: "review",
    });
  }

  const cp = c.checkpoint;
  if (cp && (cp.due || cp.result === "partial" || cp.result === "fail")) {
    items.push({ ...base, kind: "Checkpoint", title: cp.title, meta: checkpointLabel(c).text, routine: "checkpoint" });
  }

  // Reading leads the lesson but never blocks it: the lesson asks about the reading itself.
  const reading = c.next?.reading ?? c.checkpoint?.reading;
  if (reading) {
    items.push({ ...base, kind: "Reading", title: `Read ${reading.label}`, meta: reading.sections.join(", "), source: reading.source });
  }

  if (c.next) {
    const where = c.next.status === "in-progress" ? `In progress · Unit ${c.next.unit}` : `Unit ${c.next.unit}`;
    items.push({
      ...base,
      kind: "Lesson",
      title: topicTitle(c, c.next.topic),
      meta: `${where} · ${due > 0 ? `starts with your ${plural(due, "due card")}` : "no cards due"}`,
      routine: "lesson",
      topicStatus: c.next.status,
    });
  }

  const lastReady = Math.max(0, ...c.ready);
  if (c.unbuilt.includes(lastReady + 1) && (!c.next || c.next.unit === lastReady)) {
    items.push({ ...base, kind: "Build", title: `Unit ${lastReady + 1} not built yet`, meta: "Build it with `/learn:build`" });
  }

  return items;
}

/** `units` is the course's `unitFractions` and `lastLesson` its newest lesson's date, passed in so this stays free of file reads. */
export function cardData(c: CourseSummary, units: (number | null)[] = unitFractions(c), lastLesson: string | null = null): CardData {
  const items = upNext(c);
  const routines = items.filter((i) => i.kind !== "Build");
  const lead = routines[0] ?? null;
  return {
    course: c,
    units,
    checkpoint: checkpointLabel(c),
    lead,
    rest: routines.slice(1),
    build: items.find((i) => i.kind === "Build") ?? null,
    urgency: lead ? ORDER.indexOf(lead.kind) : ORDER.length,
    lastLesson,
  };
}

/** Cards most urgent first, most recently studied first within the same urgency. */
export function byUrgency(courses: CourseSummary[], lastLesson: (course: string) => string | null = () => null): CardData[] {
  return [...courses]
    .sort((a, b) => (b.last?.date ?? "").localeCompare(a.last?.date ?? ""))
    .map((c) => cardData(c, unitFractions(c), lastLesson(c.course)))
    .sort((a, b) => a.urgency - b.urgency);
}

export const HOME_COURSES = 3;

/** Home's first `HOME_COURSES` cards; `more` when any were cut. */
export function homeSlice(cards: CardData[]): { cards: CardData[]; more: boolean } {
  return { cards: cards.slice(0, HOME_COURSES), more: cards.length > HOME_COURSES };
}

/** The course a calendar entry belongs to, on Learn's calendar across courses. */
export type CourseTag = { slug: string; title: string; hue: string };

export type CalendarSession = {
  date: string;
  kind: UpNextKind;
  /** The session's topics by title. */
  title: string;
  quiz: string | null;
  cardsAdded: number | null;
  early: boolean;
  course?: CourseTag;
};

/** Cards due per day, one entry per course. */
export type CalendarDue = Record<string, { course?: CourseTag; n: number }[]>;

const SESSION_KIND: Record<string, UpNextKind> = { review: "Review", checkpoint: "Checkpoint" };

/** A course's log.md sessions as calendar entries, stamped with `course` when given. */
export function calendarSessions(c: Pick<Overview, "titles">, sessions: Session[], course?: CourseTag): CalendarSession[] {
  return sessions.map((s) => {
    const kind = SESSION_KIND[s.kind] ?? "Lesson";
    return {
      date: s.date,
      kind,
      title: s.topics.map((t) => topicTitle(c, t)).join(", ") || kind,
      quiz: s.quiz,
      cardsAdded: s.cardsAdded,
      early: s.ended === "early",
      ...(course ? { course } : {}),
    };
  });
}

/** Per-course forecasts merged by day, in the order given. */
export function mergeDue(forecasts: { course?: CourseTag; forecast: Record<string, number> }[]): CalendarDue {
  const out: CalendarDue = {};
  for (const { course, forecast } of forecasts) {
    for (const [day, n] of Object.entries(forecast)) (out[day] ??= []).push(course ? { course, n } : { n });
  }
  return out;
}

export type JourneyStep = {
  kind: "reading" | "topic" | "checkpoint";
  label: string;
  sub: string;
  state: "todo" | "part" | "done" | "now";
};

/** The step the Overview's hero shows: the first routine but Review, since a lesson opens with its cards anyway. */
const heroItem = (items: UpNextItem[]) => items.find((i) => i.kind !== "Review");

/** The unit the Overview is about: a leading checkpoint's, else the next topic's, else the open checkpoint's. */
export function currentUnit(c: Pick<Overview, "next" | "checkpoint">, items: UpNextItem[]): number | null {
  if (heroItem(items)?.kind === "Checkpoint" && c.checkpoint) return c.checkpoint.unit;
  return c.next?.unit ?? c.checkpoint?.unit ?? null;
}

/** The unit's runs of consecutive reading lines, in syllabus order. */
function readingRuns(unit: Unit): Reading[][] {
  const runs: Reading[][] = [];
  let run: Reading[] | null = null;
  for (const item of unit.items) {
    if (item.kind !== "read") run = null;
    else {
      if (!run) runs.push((run = []));
      run.push(item);
    }
  }
  return runs;
}

/** The unit's journey strip: each run of reading lines as one step, then topics and the checkpoint, in syllabus order. */
export function journeySteps(c: Pick<Overview, "next" | "checkpoint" | "titles">, unit: Unit): JourneyStep[] {
  const reading = c.next?.unit === unit.n ? c.next.reading?.source : undefined;
  const current = reading
    ? null
    : c.next?.unit === unit.n
      ? c.next.topic
      : c.checkpoint?.unit === unit.n && c.checkpoint.due
        ? "checkpoint"
        : null;
  const runs = readingRuns(unit);
  const steps: JourneyStep[] = [];
  let r = -1;
  let inRun = false;
  for (const item of unit.items) {
    if (item.kind === "read") {
      if (inRun) continue;
      inRun = true;
      const run = runs[++r];
      const done = run.filter((r) => r.status === "done").length;
      steps.push({
        kind: "reading",
        label: "Reading",
        sub: `${done} of ${run.length} read`,
        state: run.some((r) => r.source === reading) ? "now" : done === run.length ? "done" : done ? "part" : "todo",
      });
      continue;
    }
    inRun = false;
    if (item.kind === "topic") {
      steps.push({
        kind: "topic",
        label: c.titles[item.topic] ?? item.topic,
        sub: item.status === "in-progress" ? "In progress" : item.status === "done" ? "Done" : "",
        state: item.topic === current ? "now" : item.status === "done" ? "done" : "todo",
      });
    } else {
      steps.push({
        kind: "checkpoint",
        label: `Checkpoint ${unit.n}`,
        sub: item.result === "pending" ? (current === "checkpoint" ? "Due" : "") : item.result.replace(/^./, (s) => s.toUpperCase()),
        state: current === "checkpoint" ? "now" : item.result === "pass" ? "done" : "todo",
      });
    }
  }
  return steps;
}

export type HeroChip = {
  label: string;
  detail: string | null;
  met: boolean;
  /** The chip's hover tip: the topic's exercises that count. */
  tip?: "exercises";
};

export type ReadingChapter = { label: string; source: string; status: Reading["status"]; sections: string[] };
/** `book` is null for reading lines whose label names no chapter. */
export type ReadingBook = { book: string | null; chapters: ReadingChapter[] };

export type HeroStep = {
  kind: "topic" | "reading" | "checkpoint";
  title: string;
  line: string | null;
  chips: HeroChip[];
  books?: ReadingBook[];
};

/** Reading lines grouped by book, split from the label at its last ` ch. ` (`DDIA ch. 2` → `DDIA`, `Ch. 2`). */
export function readingBooks(items: Reading[]): ReadingBook[] {
  const books: ReadingBook[] = [];
  for (const r of items) {
    const at = r.label.lastIndexOf(" ch. ");
    const book = at < 0 ? null : r.label.slice(0, at);
    const label = at < 0 ? r.label : `Ch. ${r.label.slice(at + 5)}`;
    let group = books.find((b) => b.book === book);
    if (!group) books.push((group = { book, chapters: [] }));
    group.chapters.push({ label, source: r.source, status: r.status, sections: r.sections });
  }
  return books;
}

const KINDS: ExerciseKind[] = ["apply", "analyse", "transfer"];

/** The exercise tip's rows: one per kind, hardest last, kinds without exercises dropped. */
export function exerciseRows(
  exercises: TopicProgress["exercises"],
): { kind: ExerciseKind; items: { n: number; steps: number; parts: Rung[] | null }[] }[] {
  return KINDS.map((kind) => ({
    kind,
    items: exercises.filter((e) => e.kind === kind).map(({ n, steps, parts }) => ({ n, steps, parts })),
  })).filter((row) => row.items.length);
}

/** A part's pip: on your own (alone or nudge), with a hint, or answer given (partial or shown). */
export function pip(rung: Rung): "own" | "hint" | "given" {
  return rung === "alone" || rung === "nudge" ? "own" : rung === "hint" ? "hint" : "given";
}

/** The tried exercise with the largest share of parts not given away, as `best k/m · e<n>`; the lower number on a tie. */
function exerciseDetail(exercises: TopicProgress["exercises"]): string {
  let best: { n: number; parts: Rung[] } | null = null;
  for (const { n, parts } of exercises) {
    if (parts && (!best || keptParts(parts) / parts.length > keptParts(best.parts) / best.parts.length)) best = { n, parts };
  }
  return best ? `best ${keptParts(best.parts)}/${best.parts.length} · e${best.n}` : "None tried yet";
}

/**
 * The Overview hero for `unit` (from `currentUnit`): the reading, checkpoint or topic its journey lights. `items` are
 * the card's routines, lead first. Null when nothing in the unit is next.
 */
export function heroStep(
  c: Pick<Overview, "next" | "checkpoint" | "titles" | "cards">,
  unit: Unit,
  items: UpNextItem[],
  progress: TopicProgress | null,
): HeroStep | null {
  const step = heroItem(items);
  if (step?.kind === "Reading") {
    const run = readingRuns(unit).find((rs) => rs.some((r) => r.source === step.source)) ?? [];
    return {
      kind: "reading",
      title: `Reading for unit ${unit.n}`,
      line: `${plural(run.length, "chapter")}, on your own`,
      chips: [],
      books: readingBooks(run),
    };
  }
  const cp = c.checkpoint;
  if (step?.kind === "Checkpoint" && cp) {
    const retry = cp.result === "partial" || cp.result === "fail";
    return {
      kind: "checkpoint",
      title: `Checkpoint ${cp.unit}`,
      line: "An unseen task set from the unit's rubric, done without help",
      chips: [
        { label: `All ${plural(unit.topics.length, "topic")} done`, detail: null, met: cp.left.length === 0 },
        { label: "Pass the checkpoint", detail: retry ? `Last try: ${cp.result}` : "80% of the rubric", met: false },
      ],
    };
  }
  if (!c.next || c.next.unit !== unit.n) return null;
  const due = c.cards.due;
  return {
    kind: "topic",
    title: topicTitle(c, c.next.topic),
    line: due > 0 ? `Starts with your ${plural(due, "due card")}` : null,
    chips: progress
      ? [
          { label: "Quiz 4/5 or better", detail: progress.lastQuiz, met: progress.quizOk },
          { label: "Half an exercise, no answers given", detail: exerciseDetail(progress.exercises), met: progress.practised, tip: "exercises" },
        ]
      : [],
  };
}
