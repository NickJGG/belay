"use client";

import type * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, Play } from "lucide-react";
import { MenuButton } from "@/components/belay/controls";
import belay from "@/components/belay/belay.module.css";
import { PageHeader } from "@/components/layout/page-header";
import { Mark } from "@/components/layout/logo";
import { PageCommands, type PageCommand } from "@/components/layout/palette";
import { buttonClass } from "@/components/ui/button";
import { useLive } from "@/components/live/live-provider";
import { SECTIONS, sectionOf } from "@/lib/course-nav";
import { courseHref, vscodeHref } from "@/lib/hrefs";
import { cn } from "@/lib/utils";
import { liveLesson, StartButton, startOptions, startRoutine } from "./start-buttons";
import styles from "./course.module.css";

/** The course's sections as chips under its header, on phones only: the sidebar nests them from 768px. */
function CourseChips({ course }: { course: string }) {
  const where = sectionOf(usePathname() ?? "/");
  return (
    <nav className={belay.secChips} aria-label="Course sections">
      {SECTIONS.map((s) => {
        const on = s.label === where?.section;
        return (
          <Link key={s.label} href={courseHref(course, s.suffix)} className={cn(belay.secChip, on && belay.secChipOn)} aria-current={on ? "page" : undefined}>
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}

/** The course mark and title in the course's hue, as a header title. */
export function CourseTitle({ title, color }: { title: React.ReactNode; color: string }) {
  return (
    <span className={styles.title} style={{ "--hue": color } as React.CSSProperties}>
      <Mark tone="current" className={styles.titleMark} />
      {title}
    </span>
  );
}

/**
 * A course's header: the art fades down in the course's hue; on it ‹ Courses, the mark and name, ⋯ (the
 * folder and course.md), and the start buttons at the right; then the section chips. The palette lists the starts.
 */
export function CourseHead({
  course,
  title,
  color,
  dir,
  next,
  due,
  checkpoint,
}: {
  course: string;
  title: string;
  color: string;
  dir: string;
  /** The syllabus's next topic, when there is one. */
  next: string | null;
  due: number;
  /** The unit whose checkpoint is due, or null. */
  checkpoint: number | null;
}) {
  const starts = startOptions({ lesson: !!next, due, checkpoint });
  // From the palette there's no popover to ask in, so a live lesson is always wrapped up first.
  const wrap = !!liveLesson(useLive().live);
  const commands: PageCommand[] = starts.map((s) => ({
    id: s.routine,
    label: s.label,
    icon: <Play size={14} aria-hidden />,
    run: () => void startRoutine(course, s.routine, wrap),
  }));
  return (
    <>
      <PageCommands heading={title} items={commands} />
      <PageHeader
        title={<CourseTitle title={title} color={color} />}
        back={{ href: "/learn", label: "Learn" }}
        nav={<CourseChips course={course} />}
      >
        <MenuButton label="Course files" trigger={<MoreHorizontal size={18} aria-hidden />}>
          {(close) => (
            <>
              <a role="menuitem" className={belay.menuItem} href={vscodeHref(dir)} onClick={close}>
                Open course folder
              </a>
              <a role="menuitem" className={belay.menuItem} href={vscodeHref(`${dir}/course.md`)} onClick={close}>
                Open course.md
              </a>
            </>
          )}
        </MenuButton>
        <span className={styles.starts}>
          {starts.map((s) => (
            <StartButton key={s.routine} course={course} routine={s.routine} label={s.label} className={buttonClass(s.primary ? "default" : "outline", "sm")} />
          ))}
        </span>
      </PageHeader>
    </>
  );
}
