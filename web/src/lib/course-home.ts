import { checkpointLabel, unitFractions, type CourseSummary, type TopicStatus } from "./courses.ts";
import type { Routine } from "./routines.ts";

/*
 * The course cards: one per course, with an Up next band led by the course's most urgent routine.
 */

export type UpNextKind = "Review" | "Checkpoint" | "Lesson" | "Build";

export type UpNextItem = {
  kind: UpNextKind;
  course: string;
  courseTitle: string;
  title: string;
  meta: string;
  /** The routine the band's button starts; none for the Build nudge. */
  routine?: Routine;
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
};

/** More due cards than a lesson's opening review takes. */
const LESSON_CARDS = 20;

const ORDER: UpNextKind[] = ["Review", "Checkpoint", "Lesson", "Build"];

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

  if (c.next) {
    const where = c.next.status === "in-progress" ? `In progress · Unit ${c.next.unit}` : `Unit ${c.next.unit}`;
    items.push({
      ...base,
      kind: "Lesson",
      title: c.next.topic,
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

/** `units` is the course's `unitFractions`, passed in so this stays free of file reads. */
export function cardData(c: CourseSummary, units: (number | null)[] = unitFractions(c)): CardData {
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
  };
}

/** Cards most urgent first, most recently studied first within the same urgency. */
export function byUrgency(courses: CourseSummary[]): CardData[] {
  return [...courses]
    .sort((a, b) => (b.last?.date ?? "").localeCompare(a.last?.date ?? ""))
    .map((c) => cardData(c))
    .sort((a, b) => a.urgency - b.urgency);
}
