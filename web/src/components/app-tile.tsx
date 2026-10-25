import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { hue } from "@/components/project-mark";
import type { ProjectTile } from "@/lib/data";
import { cn } from "@/lib/utils";
import styles from "./app-tile.module.css";

/**
 * A project as a portfolio-style app tile: its icon, else a gradient tile lettered with its key, else (Unfiled)
 * a dashed `?`; an ember badge when it has open work.
 */
export function AppTile({ project, href }: { project: ProjectTile; href: string }) {
  const { mark, open } = project;
  return (
    <Link href={href} className={styles.tile}>
      {!mark ? (
        <span className={cn(styles.icon, styles.glyph)} aria-hidden>?</span>
      ) : mark.iconV != null ? (
        <span className={styles.icon}>
          {/* eslint-disable-next-line @next/next/no-img-element -- our own icon route; next/image adds nothing */}
          <img src={`/api/projects/${mark.key}/icon?v=${mark.iconV}`} alt="" />
        </span>
      ) : (
        <span className={cn(styles.icon, styles.letter)} style={{ "--h": hue(mark.key) } as CSSProperties} aria-hidden>
          {mark.key}
        </span>
      )}
      {open > 0 && <span className={styles.badge} role="img" aria-label={`${open} open`} />}
      <span className={styles.name}>{project.name}</span>
    </Link>
  );
}

export function AppGrid({ children }: { children: ReactNode }) {
  return <div className={styles.grid}>{children}</div>;
}
