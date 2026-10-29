/** Learn's session kind on the server: its lessons' live Tabs and the course watcher. Loaded by `manifest.server.ts`. */
import { watch } from "chokidar";
import { courseList } from "../../../../lib/course-data.ts";
import { courseColor, hues, root as learningRoot } from "../../../../lib/courses.ts";
import { lessonHref, lessonTopic } from "../../../../lib/lesson.ts";
import type { HubEvent } from "../../../../lib/hub.ts";
import type { KindRuntime, LiveBase } from "../../../../lib/session-kind.ts";
import { courseIgnored, courseLocate } from "./watch-paths.ts";
import { readLesson, type LessonSession } from "./sessions.ts";
import type { SessionMemo } from "../../../../lib/sessions.ts";

/** A lesson's Tab, with its `course`, the course's `color` and its topic titles, for Follow along's claim hovers. */
export type LessonLive = LiveBase & { kind: "lesson"; stage: "grilling"; course: string; color: string; titles: Record<string, string> };

export const runtime = {
  read: (root: string, slug: string, memo?: SessionMemo) => {
    const s = readLesson(root, slug, memo);
    return s?.course ? s : null;
  },
  liveItems: async (entries) => {
    const titles = new Map((await courseList()).map((c) => [c.course, c.titles]));
    const slots = hues();
    return entries.map(({ l, s }) => {
      const lesson = s!;
      const state = { working: l.working, connected: l.connected, wt: l.wt };
      const t = titles.get(lesson.course) ?? {};
      const base = { slug: l.slug, topic: lessonTopic(lesson.topic, t), status: lesson.status, live: true, mark: null, stage: "grilling" as const };
      const color = courseColor({ hue: slots.get(lesson.course) ?? 0 });
      return { ...base, ...state, kind: "lesson" as const, course: lesson.course, color, titles: t, href: lessonHref(lesson.course) };
    });
  },
  watch: (emit: (e: HubEvent) => void) => {
    const learning = learningRoot();
    const w = watch(learning, { ignoreInitial: true, ignored: courseIgnored(learning) });
    for (const ev of ["add", "change", "unlink", "addDir", "unlinkDir"] as const) {
      w.on(ev, (abs) => {
        const hit = courseLocate(learning, abs);
        if (hit) emit({ type: "course", course: hit[0], path: hit[1] });
      });
    }
    return [w];
  },
} satisfies KindRuntime<LessonSession, LessonLive>;
