import Link from "next/link";
import { ProjectMark } from "@/components/project-mark";
import { TurnDot } from "@/components/turn-dot";
import type { Mark } from "@/lib/data";
import { shortDate } from "@/lib/format";
import { grillHref } from "../_lib/hrefs";
import { cn } from "@/lib/utils";
import styles from "@/components/belay/belay.module.css";

/**
 * A grill's row, on Home and a project's Grills page: live dot, project mark (only when `mark` is passed), topic,
 * `side`, then the date. The slug shows on hover.
 */
export function GrillRow({
  slug,
  topic,
  updated,
  live,
  working,
  mark,
  side,
}: {
  slug: string;
  topic: string;
  updated?: string;
  live: boolean;
  working?: boolean;
  mark?: Mark | null;
  side?: string;
}) {
  return (
    <li className={styles.row} title={slug}>
      <span className={styles.dotSlot}>{live ? <TurnDot working={!!working} /> : <span className={styles.dot} aria-hidden />}</span>
      {mark !== undefined ? <ProjectMark mark={mark} /> : null}
      <Link href={grillHref(slug)} className={cn(styles.grow, styles.stretch)}>
        {topic}
      </Link>
      {side ? <span className={styles.side}>{side}</span> : null}
      <span className={styles.dateEnd}>{shortDate(updated)}</span>
    </li>
  );
}
