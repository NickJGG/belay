/** A lesson's runtime folder (session-format.md's Lessons): a session.json with `kind: "lesson"` and its course. */
import { baseFromJson, readSession, str, type SessionBase, type SessionFormat, type SessionMemo } from "../../../../lib/sessions.ts";

export type LessonSession = SessionBase & { kind: "lesson"; course: string };

const LESSON: SessionFormat<LessonSession> = {
  json: (slug, j) => (j.kind === "lesson" ? { ...baseFromJson(slug, j), kind: "lesson", course: str(j.course) ?? "" } : null),
  bare: () => null,
};

export const readLesson = (root: string, slug: string, memo?: SessionMemo) => readSession(root, slug, memo, LESSON);
