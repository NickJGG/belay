import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";
import { PALETTE } from "./course-art.ts";
import { visibleParts } from "./course-paths.ts";

export { visibleParts };

/*
 * Course data. Parsing belongs to the learn skill's scripts (formats.md is the contract);
 * this module only loads them, and is the one gate between the site and the course folders.
 * Synchronous and uncached: `data.ts` caches it per request.
 */

const SCRIPTS = path.join(os.homedir(), ".claude", "skills", "learn", "scripts");
// A computed path keeps the bundler from trying to resolve the skill's scripts at build time.
const load = createRequire(path.join(SCRIPTS, "package.json"));

export type TopicStatus = "todo" | "in-progress" | "done";
export type Topic = { topic: string; status: TopicStatus };
export type CheckpointResult = "pending" | "pass" | "partial" | "fail";
export type Unit = {
  n: number;
  title: string;
  topics: Topic[];
  checkpoint: { result: CheckpointResult; date: string | null; score: number | null } | null;
};

export type Overview = {
  course: string;
  goal: string | null;
  build: string | null;
  ready: number[];
  unbuilt: number[];
  traits: string[];
  cards: { total: number; due: number; overdue: number; new: number; nextDue: string | null };
  topics: { done: number; total: number };
  next: (Topic & { unit: number }) | null;
  last: { date: string; kind: string } | null;
  checkpoint: {
    unit: number;
    title: string;
    result: CheckpointResult;
    left: string[];
    due: boolean;
  } | null;
};

type Frontmatter = Record<string, string | string[] | Record<string, string | string[]>>;

type CoursesJs = {
  frontmatter: (text: string) => Frontmatter;
  syllabus: (text: string) => Unit[];
  overview: (course: string, date: string) => Overview;
  all: (date: string) => Overview[];
};

type CardsJs = {
  parse: (text: string) => {
    cards: {
      id: string;
      topic: string;
      q: string;
      a: string;
      fsrs: { due: string; reps: number; state: string };
    }[];
  };
};

const coursesJs = load(path.join(SCRIPTS, "courses.js")) as CoursesJs;
const cardsJs = load(path.join(SCRIPTS, "cards.js")) as CardsJs;
const fsrsJs = load(path.join(SCRIPTS, "fsrs.js")) as { today: () => string };

export const root = () => process.env.HANDHOLD_ROOT || path.join(os.homedir(), "Learning");

export const SLUG = /^[a-z0-9][a-z0-9-]*$/i;

export function courseDir(course: string): string | null {
  if (!SLUG.test(course)) return null;
  const dir = path.join(root(), course);
  return fs.existsSync(path.join(dir, "course.md")) ? dir : null;
}

/** The absolute path of a visible file, or null when `rel` is hidden or escapes the course. */
export function visiblePath(course: string, rel: string): string | null {
  const dir = courseDir(course);
  if (!dir) return null;
  const parts = visibleParts(rel);
  if (!parts) return null;
  const abs = path.join(dir, ...parts);
  if (!fs.existsSync(abs)) return null;
  const real = fs.realpathSync(abs);
  const realDir = fs.realpathSync(dir);
  return real.startsWith(realDir + path.sep) ? real : null;
}

export function readCourseFile(course: string, rel: string): string | null {
  const abs = visiblePath(course, rel);
  if (!abs || !fs.statSync(abs).isFile()) return null;
  return fs.readFileSync(abs, "utf8");
}

export function fileMtime(course: string, rel: string): Date | null {
  const abs = visiblePath(course, rel);
  return abs ? fs.statSync(abs).mtime : null;
}

export function fileCreated(course: string, rel: string): Date | null {
  const abs = visiblePath(course, rel);
  return abs ? fs.statSync(abs).birthtime : null;
}

/** Basenames (without .md) of the Markdown files directly in a visible folder. */
function listMarkdown(course: string, dir: string): string[] {
  const abs = visiblePath(course, dir);
  if (!abs || !fs.statSync(abs).isDirectory()) return [];
  return fs
    .readdirSync(abs, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith(".md") && !e.name.startsWith("."))
    .map((e) => e.name.slice(0, -3))
    .sort();
}

export function stripFrontmatter(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "");
}

/** The first `# ` heading and the text without it. */
export function splitTitle(text: string): { title: string | null; body: string } {
  const body = stripFrontmatter(text);
  const m = body.match(/^\s*# (.+?)\s*(?:\r?\n|$)/);
  return m ? { title: m[1], body: body.slice(m.index! + m[0].length) } : { title: null, body };
}

/** course.md may carry a `title`; otherwise the slug, with vowel-less words (llm, sql) upper-cased. */
function courseTitle(course: string, fm: Frontmatter): string {
  if (typeof fm.title === "string" && fm.title) return fm.title;
  const words = course.split("-").map((w) => (/[aeiouy]/i.test(w) ? w : w.toUpperCase()));
  return words.join(" ").replace(/^./, (c) => c.toUpperCase());
}

export type CourseSummary = Overview & {
  title: string;
  units: number;
  created: string | null;
  /** The course's slot in PALETTE. */
  hue: number;
};

export const today = () => fsrsJs.today();

const createdOf = (fm: Frontmatter) => (typeof fm.created === "string" && fm.created ? fm.created : null);

/** Palette slots in creation order (slug breaks ties), so a new course never recolours the others. */
export function hues(): Map<string, number> {
  if (!fs.existsSync(root())) return new Map();
  const courses = fs
    .readdirSync(root(), { withFileTypes: true })
    .filter((e) => e.isDirectory() && courseDir(e.name))
    .map((e) => ({
      course: e.name,
      created: createdOf(coursesJs.frontmatter(readCourseFile(e.name, "course.md") ?? "")) ?? "9999",
    }))
    .sort((a, b) => a.created.localeCompare(b.created) || a.course.localeCompare(b.course));
  return new Map(courses.map((c, i) => [c.course, i % PALETTE.length]));
}

export const courseColor = (c: Pick<CourseSummary, "hue">) => PALETTE[c.hue];

export function listCourses(): CourseSummary[] {
  if (!fs.existsSync(root())) return [];
  const slots = hues();
  return coursesJs.all(today()).map((o) => {
    const fm = coursesJs.frontmatter(readCourseFile(o.course, "course.md") ?? "");
    return {
      ...o,
      title: courseTitle(o.course, fm),
      units: o.ready.length + o.unbuilt.length,
      created: createdOf(fm),
      hue: slots.get(o.course) ?? 0,
    };
  });
}

/** Still being learned (Home's Your courses): a topic left, a checkpoint open, or units yet to build. */
export const inProgress = (c: Overview) => !!c.next || !!c.checkpoint || c.unbuilt.length > 0;

/** Per syllabus unit: the fraction of its topics done, or null when it isn't built. */
export function unitFractions(c: Overview): (number | null)[] {
  return readSyllabus(c.course).map((u) =>
    c.ready.includes(u.n) ? u.topics.filter((t) => t.status === "done").length / (u.topics.length || 1) : null,
  );
}

/** The open checkpoint as one line; `due` when it can be taken now. */
export function checkpointLabel(c: Overview): { text: string; due: boolean } {
  const cp = c.checkpoint;
  if (!cp) return { text: "All checkpoints passed", due: false };
  if (cp.result === "partial" || cp.result === "fail") {
    return { text: `Checkpoint ${cp.unit} · ${cp.result}, rerun`, due: cp.due };
  }
  if (cp.due) return { text: `Checkpoint ${cp.unit} · due`, due: true };
  const n = cp.left.length;
  return { text: `Checkpoint ${cp.unit} · ${n} topic${n === 1 ? "" : "s"} left`, due: false };
}

export type Course = CourseSummary & { syllabus: Unit[]; knowledge: Set<string> };

export function getCourse(course: string): Course | null {
  const dir = courseDir(course);
  if (!dir) return null;
  const o = coursesJs.overview(dir, today());
  const fm = coursesJs.frontmatter(readCourseFile(course, "course.md") ?? "");
  const syllabus = readSyllabus(course);
  return {
    ...o,
    course,
    title: courseTitle(course, fm),
    units: syllabus.length,
    created: createdOf(fm),
    hue: hues().get(course) ?? 0,
    syllabus,
    knowledge: new Set(listMarkdown(course, "knowledge")),
  };
}

export function readSyllabus(course: string): Unit[] {
  return coursesJs.syllabus(readCourseFile(course, "syllabus.md") ?? "");
}

/** Syllabus topics for Markdown rendering: status for map colouring, href when a note exists. */
export function topicIndex(course: Course): Record<string, { status: TopicStatus; href?: string }> {
  const out: Record<string, { status: TopicStatus; href?: string }> = {};
  for (const u of course.syllabus) {
    for (const t of u.topics) {
      out[t.topic] = {
        status: t.status,
        href: course.knowledge.has(t.topic) ? `/courses/${course.course}/knowledge/${t.topic}` : undefined,
      };
    }
  }
  return out;
}

export function unitOf(course: Pick<Course, "syllabus">, topic: string): Unit | null {
  return course.syllabus.find((u) => u.topics.some((t) => t.topic === topic)) ?? null;
}

export type NoteEntry = { slug: string; title: string };

export function listKnowledge(course: string): NoteEntry[] {
  return listMarkdown(course, "knowledge").map((slug) => ({
    slug,
    title: splitTitle(readCourseFile(course, `knowledge/${slug}.md`) ?? "").title ?? slug,
  }));
}

export type SourceEntry = { id: string; title: string; role: string };

/** Rows of sources/index.md, the register; reading each cached source would mean whole books. */
export function listSources(course: string): SourceEntry[] {
  return parseSourceIndex(readCourseFile(course, "sources/index.md") ?? "");
}

export function parseSourceIndex(text: string): SourceEntry[] {
  const rows: SourceEntry[] = [];
  for (const line of text.split(/\r?\n/)) {
    const cells = line.split("|").slice(1, -1).map((c) => c.trim());
    if (cells.length < 6 || cells[0] === "id" || /^-+$/.test(cells[0])) continue;
    rows.push({ id: cells[0], title: cells[1], role: cells[5] });
  }
  return rows;
}

export type SourceDoc = { meta: Record<string, string>; body: string };

export function getSource(course: string, id: string): SourceDoc | null {
  if (!SLUG.test(id) || id === "index") return null;
  const text = readCourseFile(course, `sources/${id}.md`);
  if (text === null) return null;
  const fm = coursesJs.frontmatter(text);
  const meta: Record<string, string> = {};
  for (const [k, v] of Object.entries(fm)) if (typeof v === "string") meta[k] = v;
  return { meta, body: stripFrontmatter(text) };
}

export type LessonEntry = { slug: string; date: string; topic: string; title: string };

const LESSON = /^(\d{4}-\d{2}-\d{2})-(.+)$/;

export function listLessons(course: string): LessonEntry[] {
  return listMarkdown(course, "lessons")
    .filter((slug) => LESSON.test(slug))
    .map((slug) => {
      const [, date, topic] = slug.match(LESSON)!;
      const title = splitTitle(readCourseFile(course, `lessons/${slug}.md`) ?? "").title;
      return { slug, date, topic, title: title ?? topic };
    })
    .reverse();
}

export type CardRow = {
  id: string;
  topic: string;
  q: string;
  /** Null until the card has been reviewed at least once. */
  a: string | null;
  state: string;
  due: string;
};

export function listCards(course: string): CardRow[] {
  const text = readCourseFile(course, "cards.md");
  if (!text) return [];
  return cardsJs.parse(text).cards.map((c) => ({
    id: c.id,
    topic: c.topic,
    q: c.q,
    a: c.fsrs.reps > 0 ? c.a : null,
    state: c.fsrs.state,
    due: c.fsrs.due,
  }));
}

export type Misconception = { topic: string | null; date: string | null; text: string };

/** Items under `## Known in the field` and `## Mine`; continuation lines join their item. */
export function listMisconceptions(course: string): { field: Misconception[]; mine: Misconception[] } {
  return parseMisconceptions(readCourseFile(course, "misconceptions.md") ?? "");
}

export function parseMisconceptions(text: string): { field: Misconception[]; mine: Misconception[] } {
  const out = { field: [] as Misconception[], mine: [] as Misconception[] };
  let section: Misconception[] | null = null;
  let item: string[] | null = null;
  const flush = () => {
    if (section && item) section.push(parseMisconception(item.join(" ")));
    item = null;
  };
  for (const line of text.split(/\r?\n/)) {
    const h = line.match(/^## (.*?)\s*$/);
    if (h) {
      flush();
      section = h[1] === "Known in the field" ? out.field : h[1] === "Mine" ? out.mine : null;
    } else if (/^- /.test(line)) {
      flush();
      item = [line.slice(2)];
    } else if (item && /^\s+\S/.test(line)) {
      item.push(line.trim());
    } else if (!line.trim()) {
      flush();
    }
  }
  flush();
  return out;
}

function parseMisconception(raw: string): Misconception {
  const m = raw.match(/^(?:(\d{4}-\d{2}-\d{2}) · )?\*\*(.+?)\*\* · ([\s\S]*)$/);
  return m ? { date: m[1] ?? null, topic: m[2], text: m[3] } : { date: null, topic: null, text: raw };
}

/** A misconception's `claim — correction` text split in two; no dash, no correction. */
export function splitMisconception(text: string): { claim: string; correction: string | null } {
  const i = text.indexOf(" — ");
  return i < 0 ? { claim: text, correction: null } : { claim: text.slice(0, i).trim(), correction: text.slice(i + 3).trim() || null };
}

const CLAIM_ID = /[ \t]\^(c\d+)[ \t]*$/gm;
const SOURCE_LINK = /\[\[sources\/([^\]|#]+)/g;

/** A knowledge note's claims (lines ending `^cN`) and the distinct sources it cites. */
export function noteStats(text: string): { claims: number; sources: number } {
  return {
    claims: new Set([...text.matchAll(CLAIM_ID)].map((m) => m[1])).size,
    sources: new Set([...text.matchAll(SOURCE_LINK)].map((m) => m[1].trim())).size,
  };
}

/** Claims across a course's knowledge notes that cite `sources/<id>`: how many, and in which topics. */
export function citedBy(course: string, id: string): { claims: number; topics: string[] } {
  let claims = 0;
  const topics: string[] = [];
  for (const topic of listMarkdown(course, "knowledge")) {
    const n = (readCourseFile(course, `knowledge/${topic}.md`) ?? "")
      .split(/\r?\n/)
      .filter((l) => /[ \t]\^c\d+[ \t]*$/.test(l) && [...l.matchAll(SOURCE_LINK)].some((m) => m[1].trim() === id)).length;
    if (n) {
      claims += n;
      topics.push(topic);
    }
  }
  return { claims, topics };
}

/** The list items under a `## <heading>` (case-insensitive) of a note, as raw lines. */
function itemsUnder(body: string, heading: RegExp): string[] {
  const out: string[] = [];
  let inside = false;
  for (const line of body.split(/\r?\n/)) {
    const h = /^#{1,3} (.*?)\s*$/.exec(line);
    if (h) inside = heading.test(h[1]);
    else if (inside && /^\s{0,1}(?:[-*+]|\d+\.)\s+\S/.test(line)) out.push(line);
  }
  return out;
}

export type LessonStats = { exercises: number; alone: number; claims: number; questions: number };

/** A lesson note's counts for its facts table, from formats.md's `lessons/` contents. */
export function lessonStats(body: string): LessonStats {
  const exercises = itemsUnder(body, /^exercises?/i).filter((l) => /\be\d+\b/.test(l));
  const claims = new Set([
    ...[...body.matchAll(/\[\[([a-z0-9-]+)#\^(c\d+)/g)].map((m) => `${m[1]}^${m[2]}`),
    ...[...body.matchAll(/\[k:([a-z0-9-]+)\^(c\d+)\]/g)].map((m) => `${m[1]}^${m[2]}`),
  ]);
  return {
    exercises: exercises.length,
    alone: exercises.filter((l) => /\balone\b/i.test(l)).length,
    claims: claims.size,
    questions: itemsUnder(body, /^open questions?/i).length,
  };
}
