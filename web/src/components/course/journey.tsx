import { BookOpen, Check, Flag } from "lucide-react";
import type { JourneyStep } from "@/lib/course-home";
import { cn } from "@/lib/utils";
import styles from "./overview.module.css";

/** A unit's steps on one line, Reading → topics → Checkpoint, the current one lit in the course colour. */
export function Journey({ steps }: { steps: JourneyStep[] }) {
  return (
    <ol className={styles.journey}>
      {steps.map((s, i) => (
        <li key={i} className={cn(styles.step, styles[s.state], s.kind === "checkpoint" && styles.checkpointStep)} aria-current={s.state === "now" ? "step" : undefined}>
          <span className={styles.dot} aria-hidden>
            {s.kind === "reading" ? <BookOpen /> : s.kind === "checkpoint" ? <Flag /> : s.state === "done" ? <Check /> : null}
          </span>
          <span className={styles.stepLabel}>{s.label}</span>
          {s.sub ? <span className={styles.stepSub}>{s.sub}</span> : null}
        </li>
      ))}
    </ol>
  );
}
