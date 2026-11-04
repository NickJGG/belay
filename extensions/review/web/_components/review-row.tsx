import Link from "next/link";
import { ProjectMark } from "@/components/project-mark";
import { TurnDot } from "@/components/turn-dot";
import type { Mark } from "@/lib/data";
import { shortDate } from "@/lib/format";
import { cn } from "@/lib/utils";
import belay from "@/components/belay/belay.module.css";
import { reviewHref } from "../_lib/hrefs";
import type { ReviewRow as Row } from "../_lib/view";
import styles from "./review.module.css";

const DOT: Record<Row["tone"], string | undefined> = { bad: styles.dotBad, ok: styles.dotOk, running: undefined, stopped: undefined };

/**
 * A review's row, on its project's Reviews and Home: verdict dot (or the live dot), project mark (only when `mark` is
 * passed), target and ref, campaign and to-fix badges, verdict, date.
 */
export function ReviewRow({ row, live, working, mark }: { row: Row; live: boolean; working?: boolean; mark?: Mark | null }) {
  return (
    <li className={belay.row} title={row.id}>
      <span className={belay.dotSlot}>{live ? <TurnDot working={!!working} /> : <span className={cn(belay.dot, DOT[row.tone])} aria-hidden />}</span>
      {mark !== undefined ? <ProjectMark mark={mark} /> : null}
      <span className={belay.keyTitle}>
        <Link href={reviewHref(row.id)} className={cn(belay.grow, belay.stretch)}>
          {row.title}
          {row.ref ? <code className={styles.ref}>{row.ref}</code> : null}
        </Link>
      </span>
      {row.campaign ? <span className={belay.badge}>{row.campaign}</span> : null}
      {row.toFix ? <span className={cn(belay.badge, styles.badgeFix)}>{row.toFix} to fix</span> : null}
      <span className={cn(belay.side, styles.verdict)}>
        {row.verdict.strong ? <span className={styles.bad}>{row.verdict.strong}</span> : null}
        <span className={belay.muted}>{row.verdict.rest}</span>
      </span>
      <span className={belay.dateEnd}>{shortDate(row.started)}</span>
    </li>
  );
}
