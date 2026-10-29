"use client";

import { usePathname } from "next/navigation";
import { FocusHighlight } from "@/components/content/focus-highlight";
import { FollowAlong } from "@/components/live/follow";
import { useLive } from "@/components/live/live-provider";
import styles from "@/components/project-mark.module.css";
import { str } from "@/components/session/drawer";
import sessionStyles from "@/components/session/session.module.css";
import type { ClientKind } from "@/lib/session-kind";
import { cn } from "@/lib/utils";
import type { LessonLive } from "../_lib/runtime.server";
import { LessonProvider } from "./lesson-state";

/** A 14px open book in its course's colour: a lesson's marker where a grill shows its ProjectMark. Decorative. */
export function CourseBook({ color, className }: { color?: string; className?: string }) {
  return (
    <svg className={cn(styles.mark, className)} viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinejoin="round" style={{ color }} aria-hidden>
      <path d="M2 3.5c2-.8 4-.8 6 .5v9c-2-1.3-4-1.3-6-.5zM14 3.5c-2-.8-4-.8-6 .5v9c2-1.3 4-1.3 6-.5z" />
    </svg>
  );
}

/** Only course pages anchor claims: a grill keeps its view (`#q-3`) in the hash. */
function CourseFocus() {
  return (usePathname() ?? "/").startsWith("/learn/") ? <FocusHighlight /> : null;
}

function Follow() {
  const { selected } = useLive();
  return selected?.kind === "lesson" ? <FollowAlong key={selected.slug} /> : null;
}

export const client: ClientKind<LessonLive> = {
  id: "learn",
  kind: "lesson",
  title: (s) => s.topic,
  place: (s) => s.course,
  mark: (s) => <CourseBook color={s.color} />,
  entry: (e) => {
    if (e.from === "site" && e.kind === "attempt") {
      return (
        <div className={sessionStyles.event}>
          You handed in <code>{str(e.path)}</code>
        </div>
      );
    }
    if (e.from === "site" && e.kind === "restart") {
      return (
        <div className={sessionStyles.event}>
          You started {str(e.label)}
          {e.wrap === true ? ", wrapping this one up first" : ""}
        </div>
      );
    }
  },
  banner: (link, slug) =>
    link.state === "disconnected" ? (
      <>Disconnected: the lesson&apos;s terminal cleared. Start the routine again to reattach.</>
    ) : (
      // Today's wording, which names /grill for a lesson too.
      <>
        No terminal attached. Run <code>/grill resume {slug}</code> in a session started with <code>belay claude</code> to answer from here.
      </>
    ),
  Provider: LessonProvider,
  refresh: (e) => e.type === "course" && !e.path.startsWith("work/"),
  Frame: CourseFocus,
  Main: Follow,
};
