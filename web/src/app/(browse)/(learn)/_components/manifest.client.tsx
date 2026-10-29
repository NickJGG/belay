"use client";

import { usePathname } from "next/navigation";
import { BookOpen, FileCode, Layers, LayoutDashboard, LibraryBig, ListChecks, MapIcon, NotebookPen, TriangleAlert } from "lucide-react";
import { FocusHighlight } from "@/components/content/focus-highlight";
import { FollowAlong } from "./follow";
import { useLive } from "@/components/live/live-provider";
import styles from "@/components/project-mark.module.css";
import { str } from "@/components/session/drawer";
import sessionStyles from "@/components/session/session.module.css";
import type { MarkdownContext } from "@/lib/markdown";
import type { ClientKind } from "@/lib/session-kind";
import type { ClientSlots } from "@/lib/slots";
import { cn } from "@/lib/utils";
import type { LearnSearch } from "../_lib/manifest.server";
import type { LessonLive } from "../_lib/runtime.server";
import { LessonProvider } from "./lesson-state";
import { CoursesBrowse, CoursesFound } from "./palette";

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

const contexts = new Map<string, MarkdownContext>();

/** One context per course, so the Drawer's memoized chat keeps it across refreshes. */
function courseContext(course: string): MarkdownContext {
  let ctx = contexts.get(course);
  if (!ctx) contexts.set(course, (ctx = { id: "learn", course }));
  return ctx;
}

export const client: ClientKind<LessonLive> = {
  id: "learn",
  kind: "lesson",
  title: (s) => s.topic,
  place: (s) => s.course,
  mark: (s) => <CourseBook color={s.color} />,
  markdown: (s) => courseContext(s.course),
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
  banner: (link) =>
    link.state === "disconnected" ? (
      <>Disconnected: the lesson&apos;s terminal cleared. Start the routine again to reattach.</>
    ) : (
      <>
        No terminal attached. Start the routine again in a session started with <code>belay learn</code> to answer from here.
      </>
    ),
  Provider: LessonProvider,
  refresh: (e) => e.type === "course" && !e.path.startsWith("work/"),
  Frame: CourseFocus,
  Main: Follow,
};

const under = (base: string) => (p: string) => p === base || p.startsWith(`${base}/`);

export const slots: ClientSlots<LearnSearch> = {
  id: "learn",
  nav: [{ href: "/learn", label: "Learn", icon: LibraryBig, on: under("/learn"), parent: (slot) => slot.owner?.id === "learn" }],
  sectionIcons: {
    Overview: LayoutDashboard,
    Syllabus: ListChecks,
    Map: MapIcon,
    Lessons: BookOpen,
    Notes: NotebookPen,
    Misconceptions: TriangleAlert,
    Cards: Layers,
    Work: FileCode,
  },
  Browse: CoursesBrowse,
  Found: CoursesFound,
};
