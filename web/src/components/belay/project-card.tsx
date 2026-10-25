import Link from "next/link";
import { CourseTerrain } from "@/components/course/course-terrain";
import { projectColor } from "@/components/project-mark";
import type { Mark } from "@/lib/data";
import { projectHref } from "@/lib/hrefs";
import { cn } from "@/lib/utils";
import styles from "./project-card.module.css";

/**
 * A project as a course card: a terrain cover in its hue with its icon over it (a lettered tile when
 * it has none, a `?` for Unfiled), the name and a facts line.
 */
export function ProjectCard({ projectKey, name, mark, facts }: { projectKey: string; name: string; mark: Mark | null; facts: string }) {
  const color = mark ? projectColor(mark) : "var(--faint)";
  return (
    <div className={styles.card} style={{ "--hue": color } as React.CSSProperties}>
      <span className={styles.cover}>
        <CourseTerrain slug={projectKey} width={400} height={96} className={styles.terrain} />
      </span>
      {!mark ? (
        <span className={cn(styles.icon, styles.glyph)} aria-hidden>
          ?
        </span>
      ) : mark.iconV != null ? (
        <span className={styles.icon}>
          {/* eslint-disable-next-line @next/next/no-img-element -- our own icon route; next/image adds nothing */}
          <img src={`/api/projects/${mark.key}/icon?v=${mark.iconV}`} alt="" />
        </span>
      ) : (
        <span className={cn(styles.icon, styles.letter)} aria-hidden>
          {mark.key}
        </span>
      )}
      <Link href={projectHref(projectKey)} className={styles.title}>
        {name}
      </Link>
      <span className={styles.facts}>{facts}</span>
    </div>
  );
}

export function ProjectCards({ children }: { children: React.ReactNode }) {
  return <div className={styles.grid}>{children}</div>;
}
