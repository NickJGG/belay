import { PATH_PATTERNS } from "../../../../../../src/extension-ids.ts";
import { toShow, type LessonShow } from "../../../../lib/lesson.ts";
import type { PureKind } from "../../../../lib/session-kind.ts";

const session: PureKind<LessonShow> = {
  tools: {},
  focus: toShow,
  // Today's wording, which names /grill for a lesson too.
  reattach: (slug) => `Not attached: run \`/grill resume ${slug}\` in the terminal`,
};

export const manifest = { id: "learn", noun: "courses", patterns: PATH_PATTERNS.learn, session } as const;
