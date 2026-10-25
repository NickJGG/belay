import "server-only";
import { connection } from "next/server";
import { cache } from "react";
import { byUrgency, type CardData } from "./course-home";
import {
  citedBy,
  courseColor,
  fileCreated,
  getCourse,
  getSource,
  inProgress,
  lessonStats,
  listCards,
  listCourses,
  listKnowledge,
  listLessons,
  listMisconceptions,
  listSources,
  noteStats,
  readCourseFile,
  splitMisconception,
  splitTitle,
  today,
  unitOf,
  visiblePath,
  type Course,
  type LessonEntry,
  type LessonStats,
  type Misconception,
  type SourceDoc,
  type TopicStatus,
  type Unit,
} from "./courses";
import { sessionFor } from "./session-log";

/** Every course's overview, loaded once per request. */
export const courseList = cache(async () => {
  await connection();
  return listCourses();
});

/** One course with its syllabus, loaded once per request (the tab layout and its page both ask); null when unknown. */
export const courseData = cache(async (c: string): Promise<Course | null> => {
  await connection();
  return getCourse(c);
});

/** The Courses page: every course's card, most urgent first. */
export async function courseCards(): Promise<CardData[]> {
  return byUrgency(await courseList());
}

/** Home's Your courses: the cards of courses still being learned. */
export async function homeCourses(): Promise<CardData[]> {
  return byUrgency((await courseList()).filter(inProgress));
}

export type CourseHit = { course: string; title: string; color: string };

export type CourseIndex = {
  courses: CourseHit[];
  lessons: (LessonEntry & { course: string; courseTitle: string })[];
  notes: { course: string; slug: string; title: string }[];
  sources: { course: string; id: string; title: string }[];
  misconceptions: { course: string; topic: string; claim: string }[];
};

/** The palette's course names: courses, then their lessons, notes, sources and misconceptions. */
export async function courseIndex(): Promise<CourseIndex> {
  const courses = await courseList();
  const out: CourseIndex = { courses: [], lessons: [], notes: [], sources: [], misconceptions: [] };
  for (const c of courses) {
    out.courses.push({ course: c.course, title: c.title, color: courseColor(c) });
    out.lessons.push(...listLessons(c.course).map((l) => ({ ...l, course: c.course, courseTitle: c.title })));
    out.notes.push(...listKnowledge(c.course).map((n) => ({ course: c.course, ...n })));
    out.sources.push(...listSources(c.course).map(({ id, title }) => ({ course: c.course, id, title })));
    const { mine, field } = listMisconceptions(c.course);
    out.misconceptions.push(
      ...[...mine, ...field].flatMap((m) => (m.topic ? [{ course: c.course, topic: m.topic, claim: plain(splitMisconception(m.text).claim) }] : [])),
    );
  }
  return out;
}

/** Markdown's inline marks and links stripped, for a palette row. */
const plain = (md: string) =>
  md
    .replace(/\[\[[^\]|]*\|([^\]]+)\]\]/g, "$1")
    .replace(/\[\[([^\]]+)\]\]/g, (_, t: string) => t.split("/").pop() ?? t)
    .replace(/[*_`$]/g, "")
    .trim();

export type MisconceptionItem = { claim: string; correction: string | null; date: string | null };

/** The Misconceptions tab: yours, then the field's grouped by topic in syllabus order. */
export function misconceptionGroups(course: Course): { mine: MisconceptionItem[]; field: { topic: string; items: MisconceptionItem[] }[] } {
  const { mine, field } = listMisconceptions(course.course);
  const item = (m: Misconception): MisconceptionItem => ({ ...splitMisconception(m.text), date: m.date });
  const order = course.syllabus.flatMap((u) => u.topics.map((t) => t.topic));
  const groups = new Map<string, MisconceptionItem[]>();
  for (const m of field) groups.set(m.topic ?? "", [...(groups.get(m.topic ?? "") ?? []), item(m)]);
  const rank = (t: string) => (order.includes(t) ? order.indexOf(t) : order.length);
  return {
    mine: mine.map((m) => {
      const i = item(m);
      return m.topic ? { ...i, claim: `**${m.topic}** · ${i.claim}` } : i;
    }),
    field: [...groups].sort((a, b) => rank(a[0]) - rank(b[0])).map(([topic, items]) => ({ topic, items })),
  };
}

export type KnowledgeDetail = {
  title: string;
  body: string;
  unit: Unit | null;
  status: TopicStatus | null;
  claims: number;
  sources: number;
  lessons: LessonEntry[];
  misconceptions: number;
  cards: { total: number; due: number };
  abs: string | null;
};

/** A knowledge note's page; null when the course has no such note. */
export function knowledgeDetail(course: Course, topic: string): KnowledgeDetail | null {
  const rel = `knowledge/${topic}.md`;
  const text = readCourseFile(course.course, rel);
  if (text === null) return null;
  const { title, body } = splitTitle(text);
  const unit = unitOf(course, topic);
  const { mine, field } = listMisconceptions(course.course);
  const cards = listCards(course.course).filter((c) => c.topic === topic);
  const now = today();
  return {
    title: title ?? topic,
    body,
    unit,
    status: unit?.topics.find((t) => t.topic === topic)?.status ?? null,
    ...noteStats(body),
    lessons: listLessons(course.course).filter((l) => l.topic === topic),
    misconceptions: [...mine, ...field].filter((m) => m.topic === topic).length,
    cards: { total: cards.length, due: cards.filter((c) => c.due <= now).length },
    abs: visiblePath(course.course, rel),
  };
}

export type LessonDetail = LessonEntry & {
  body: string;
  unit: Unit | null;
  stats: LessonStats;
  /** The Claude Code session that wrote it, for Resume conversation. */
  session: string | null;
  abs: string | null;
};

/** A lesson note's page; null when the course has no such note. */
export function lessonDetail(course: Course, slug: string): LessonDetail | null {
  const entry = listLessons(course.course).find((l) => l.slug === slug);
  const rel = `lessons/${slug}.md`;
  const text = entry && readCourseFile(course.course, rel);
  if (!entry || text == null) return null;
  const { body } = splitTitle(text);
  return {
    ...entry,
    body,
    unit: unitOf(course, entry.topic),
    stats: lessonStats(body),
    session: sessionFor(course.course, rel, fileCreated(course.course, rel)),
    abs: visiblePath(course.course, rel),
  };
}

export type SourceDetail = SourceDoc & { title: string; citedBy: { claims: number; topics: string[] }; abs: string | null };

/** A source's page; null when the course has no such source. */
export function sourceDetail(course: Course, id: string): SourceDetail | null {
  const source = getSource(course.course, id);
  if (!source) return null;
  const { title, body } = splitTitle(source.body);
  return {
    meta: source.meta,
    body,
    title: source.meta.title ?? title ?? id,
    citedBy: citedBy(course.course, id),
    abs: visiblePath(course.course, `sources/${id}.md`),
  };
}
