"use client";

import { usePathname } from "next/navigation";
import { BookOpen, FileCode, Layers, LayoutDashboard, ListChecks, MapIcon, NotebookPen, TriangleAlert } from "lucide-react";
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
import { LearnIcon, LearnMark } from "./mark";
import { CoursesBrowse, CoursesFound } from "./palette";

/** Learn's mark at 14px in its course's colour: a lesson's marker where a grill shows its ProjectMark. Decorative. */
export function CourseBook({ color, className }: { color?: string; className?: string }) {
  return (
    <span className={cn(styles.mark, className)} style={{ color }}>
      <LearnIcon size={14} />
    </span>
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
  name: "Learn",
  summary: "Courses and /learn lessons from ~/Learning, with their pages and Tabs.",
  Mark: LearnMark,
  nav: [{ href: "/learn", label: "Learn", icon: LearnIcon, on: under("/learn"), parent: (slot) => slot.owner?.id === "learn" }],
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
