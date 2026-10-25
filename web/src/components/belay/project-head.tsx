"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { MoreHorizontal, Star } from "lucide-react";
import type { Project } from "../../../../src/store.ts";
import { moveProjectBy, setProjectColor, setProjectFocus, setProjectGroup, setProjectKinds, setProjectName, setProjectStatus } from "@/app/actions";
import { PageHeader } from "@/components/layout/page-header";
import { sectionsOf } from "@/components/layout/site-nav";
import { projectColor, ProjectMark } from "@/components/project-mark";
import type { Mark } from "@/lib/data";
import { projectHref } from "@/lib/hrefs";
import { cn } from "@/lib/utils";
import { MenuButton, TextEdit, useAction, useOptimisticAction } from "./controls";
import styles from "./belay.module.css";

const PROJECT_STATUSES: Project["status"][] = ["active", "paused", "archived"];

/** The project's sections as chips under its header (grill Q8/Q19), on phones only: the sidebar nests them from 768px. */
function SectionChips({ projectKey }: { projectKey: string }) {
  const pathname = usePathname();
  return (
    <nav className={styles.secChips} aria-label="Project sections">
      {sectionsOf(projectKey).map((s) => {
        const href = projectHref(projectKey, s.suffix);
        // /p/sear reaches SEAR too.
        const on = pathname?.toLowerCase() === href.toLowerCase();
        return (
          <Link key={s.label} href={href} className={cn(styles.secChip, on && styles.secChipOn)} aria-current={on ? "page" : undefined}>
            {s.label}
          </Link>
        );
      })}
    </nav>
  );
}

/**
 * A project's header (grill Q10): the art fades down in the project's hue; on it the mark, the name, a ☆ focus
 * toggle and ⋯ holding status, group, kinds and name, then the section chips.
 */
export function ProjectHead({
  project,
  mark,
  prev,
  next,
}: {
  project: Pick<Project, "key" | "name" | "status" | "focus" | "group" | "kinds">;
  mark: Mark | null;
  prev?: string;
  next?: string;
}) {
  const { key } = project;
  return (
    <PageHeader
      title={
        <span className={styles.projectTitle}>
          <ProjectMark mark={mark} className={styles.titleMark} />
          {project.name}
        </span>
      }
      back={{ href: "/p", label: "Projects" }}
      hue={mark ? projectColor(mark) : undefined}
      seed={key}
      nav={<SectionChips projectKey={key} />}
    >
      {mark ? <ProjectActions project={project} mark={mark} prev={prev} next={next} /> : null}
    </PageHeader>
  );
}

function ProjectActions({
  project,
  mark,
  prev,
  next,
}: {
  project: Pick<Project, "key" | "status" | "focus" | "group" | "kinds" | "name">;
  mark: Mark;
  prev?: string;
  next?: string;
}) {
  const { key } = project;
  const [focus, setFocus] = useOptimisticAction(project.focus, (f) => setProjectFocus(key, f));
  const [status, setStatus] = useOptimisticAction(project.status, (s) => setProjectStatus(key, s));
  const [pending, run] = useAction();
  return (
    <span className={styles.tools}>
      <button
        type="button"
        className={cn(styles.tool, focus && styles.toolOn)}
        aria-pressed={focus}
        aria-label="Focus"
        title={focus ? "Remove focus" : "Focus"}
        onClick={() => setFocus(!focus)}
      >
        <Star size={17} fill={focus ? "currentColor" : "none"} aria-hidden />
      </button>
      <MenuButton label="Project settings" trigger={<MoreHorizontal size={18} aria-hidden />} focus="[aria-pressed=true]">
        {(close) => (
          <>
            <div className={styles.menuField}>
              <span>Status</span>
              <div className={styles.seg} role="group" aria-label="Status">
                {PROJECT_STATUSES.map((s) => (
                  <button key={s} type="button" aria-pressed={s === status} onClick={() => s !== status && setStatus(s)}>
                    {s[0].toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <label className={styles.menuField}>
              <span>Name</span>
              <TextEdit className={styles.input} value={project.name} label="Name" save={(v) => setProjectName(key, v)} />
            </label>
            <label className={styles.menuField}>
              <span>Group</span>
              <TextEdit className={styles.input} value={project.group ?? ""} label="Group" placeholder="None" save={(v) => setProjectGroup(key, v)} />
            </label>
            <label className={styles.menuField}>
              <span>Colour</span>
              <TextEdit className={styles.input} value={mark.color ?? ""} label="Colour" placeholder="From the key, or #8b7cf6" save={(v) => setProjectColor(key, v)} />
            </label>
            <label className={styles.menuField}>
              <span>Kinds</span>
              <TextEdit className={styles.input} value={project.kinds?.join(", ") ?? ""} label="Kinds" placeholder="None, or applied, outreach" save={(v) => setProjectKinds(key, v)} />
            </label>
            {prev || next ? <hr className={styles.menuSep} /> : null}
            {prev ? (
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                disabled={pending}
                onClick={() => {
                  close();
                  run(() => moveProjectBy(key, { before: prev }));
                }}
              >
                Move up
              </button>
            ) : null}
            {next ? (
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                disabled={pending}
                onClick={() => {
                  close();
                  run(() => moveProjectBy(key, { after: next }));
                }}
              >
                Move down
              </button>
            ) : null}
          </>
        )}
      </MenuButton>
    </span>
  );
}
