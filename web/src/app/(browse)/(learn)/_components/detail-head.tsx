"use client";

import { MessageSquareText, MoreHorizontal } from "lucide-react";
import { resumeLesson } from "@/app/(browse)/(learn)/_lib/course-actions";
import { toast, toastError } from "@/components/belay/toaster";
import { MenuButton } from "@/components/belay/controls";
import belay from "@/components/belay/belay.module.css";
import { PageHeader } from "@/components/layout/page-header";
import { PageCommands, type PageCommand } from "@/components/layout/palette";
import { vscodeHref } from "@/lib/hrefs";
import { copyCommand } from "./start-buttons";

/** Opens the lesson's conversation in a terminal, or copies its resume command when none can start. */
async function resume(course: string, slug: string) {
  const r = await resumeLesson(course, slug);
  if (r.error) toastError(r.error);
  else if (r.command) void copyCommand(r.command, `a terminal in the course folder`);
  else toast("Opened the conversation in a terminal.");
}

/**
 * A course detail page's header, in the issue page's grammar with no chips: ‹ back, the title, and
 * ⋯ holding Open file (and, on a lesson note, Resume conversation, also offered first in the palette).
 */
export function DetailHead({
  title,
  back,
  file,
  lesson,
}: {
  title: string;
  back: { href: string; label: string };
  /** The note's absolute path, for Open file. */
  file: string | null;
  /** A lesson note with a known conversation: its course and slug. */
  lesson?: { course: string; slug: string };
}) {
  const commands: PageCommand[] = lesson
    ? [{ id: "resume", label: "Resume conversation", icon: <MessageSquareText size={14} aria-hidden />, run: () => void resume(lesson.course, lesson.slug) }]
    : [];
  return (
    <>
      {commands.length ? <PageCommands heading={title} items={commands} /> : null}
      <PageHeader title={title} back={back}>
        {file || lesson ? (
          <MenuButton label="Note actions" trigger={<MoreHorizontal size={18} aria-hidden />}>
            {(close) => (
              <>
                {lesson ? (
                  <button
                    type="button"
                    role="menuitem"
                    className={belay.menuItem}
                    onClick={() => {
                      close();
                      void resume(lesson.course, lesson.slug);
                    }}
                  >
                    Resume conversation
                  </button>
                ) : null}
                {file ? (
                  <a role="menuitem" className={belay.menuItem} href={vscodeHref(file)} onClick={close}>
                    Open file
                  </a>
                ) : null}
              </>
            )}
          </MenuButton>
        ) : null}
      </PageHeader>
    </>
  );
}
