import type { CSSProperties } from "react";
import type { Mark } from "@/lib/data";
import { cn } from "@/lib/utils";
import styles from "./project-mark.module.css";

/** A stable hue per key, so a project's lettered tile keeps its colour. */
export function hue(key: string) {
  let h = 0;
  for (const c of key) h = (h * 31 + c.charCodeAt(0)) % 360;
  return h;
}

/**
 * A 14px project marker: the project's icon, else a tile lettered with its key, else (unfiled) an outlined `?`.
 * Decorative: the project is named in the surrounding text or title.
 */
export function ProjectMark({ mark, className }: { mark: Mark | null; className?: string }) {
  if (!mark) return <span className={cn(styles.mark, styles.unfiled, className)} aria-hidden>?</span>;
  if (mark.iconV != null) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- a 14px favicon from our own route; next/image adds nothing
      <img className={cn(styles.mark, className)} src={`/api/projects/${mark.key}/icon?v=${mark.iconV}`} alt="" aria-hidden />
    );
  }
  return (
    <span className={cn(styles.mark, styles.tile, className)} style={{ "--h": hue(mark.key) } as CSSProperties} aria-hidden>
      {mark.key[0]}
    </span>
  );
}
