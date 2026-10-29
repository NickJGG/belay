import { lessonsDir } from "../../../../../../src/config.ts";
import type { ServerKind } from "../../../../lib/session-kind.ts";
import type { ServerSlots } from "../../../../lib/slots.ts";

/** Its runtime loads courses.ts, which loads the learn skill's scripts, so it waits until learn is first needed. */
export const server = {
  id: "learn",
  root: lessonsDir,
  load: async () => (await import("./runtime.server.ts")).runtime,
} satisfies ServerKind;

/** A lesson outweighs an issue moved to done. */
const LESSON_WEIGHT = 5;

/** Each loads courses.ts on call, for the same reason. */
export const slots = {
  id: "learn",
  search: async () => (await import("../../../../lib/course-data.ts")).courseIndex(),
  home: async () => (await import("../_components/home-courses.tsx")).HomeCourses,
  grid: async () => {
    const { listCourses, listLessons } = await import("../../../../lib/courses.ts");
    const days = listCourses().flatMap((course) => listLessons(course.course).map((l) => l.date));
    return { days, weight: LESSON_WEIGHT, unit: ["lesson", "lessons"] as [string, string] };
  },
} satisfies ServerSlots;

export type LearnSearch = Awaited<ReturnType<typeof slots.search>>;
