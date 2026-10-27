import { checkpointLabel, topicTitle, unitFractions, type CourseSummary, type Overview, type TopicStatus, type Unit } from "./courses.ts";
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

export type JourneyStep = {
  kind: "reading" | "topic" | "checkpoint";
  label: string;
  sub: string;
  state: "todo" | "part" | "done" | "now";
};

/** The unit's journey strip: each run of reading lines as one step, then topics and the checkpoint, in syllabus order. */
export function journeySteps(c: Pick<Overview, "next" | "checkpoint" | "titles">, unit: Unit): JourneyStep[] {
  const current = c.next?.unit === unit.n ? c.next.topic : c.checkpoint?.unit === unit.n && c.checkpoint.due ? "checkpoint" : null;
  const steps: JourneyStep[] = [];
  let run: { done: number; of: number } | null = null;
  for (const item of unit.items) {
    if (item.kind !== "read") run = null;
    if (item.kind === "read") {
      if (!run) {
        run = { done: 0, of: 0 };
        steps.push({ kind: "reading", label: "Reading", sub: "", state: "todo" });
      }
      run.of++;
      if (item.status === "done") run.done++;
      const step = steps[steps.length - 1];
      step.sub = `${run.done} of ${run.of} read`;
      step.state = run.done === run.of ? "done" : run.done ? "part" : "todo";
    } else if (item.kind === "topic") {
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
