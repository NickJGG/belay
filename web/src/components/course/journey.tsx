import { BookOpen, Check, Flag } from "lucide-react";
import { StatusIcon } from "@/components/belay/status-icon";
import type { JourneyStep } from "@/lib/course-home";
import { cn } from "@/lib/utils";
import styles from "./overview.module.css";

function StepIcon({ step }: { step: JourneyStep }) {
  if (step.kind === "reading") return <BookOpen />;
  if (step.state === "now") return <StatusIcon status="doing" size={24} label="In progress" />;
  if (step.kind === "checkpoint") return <Flag />;
  return step.state === "done" ? <Check strokeWidth={3} /> : null;
}

/** A unit's steps on one line, Reading → topics → Checkpoint, the current one lit in the course colour. */
export function Journey({ steps }: { steps: JourneyStep[] }) {
  return (
    <ol className={styles.journey}>
      {steps.map((s, i) => (
        <li key={i} className={cn(styles.step, styles[s.state], s.kind === "checkpoint" && styles.checkpointStep)} aria-current={s.state === "now" ? "step" : undefined}>
          <span className={cn(styles.dot, s.state === "now" && s.kind !== "reading" && styles.nowShape)} aria-hidden>
            <StepIcon step={s} />
          </span>
          <span className={styles.stepLabel}>{s.label}</span>
          {s.sub ? <span className={styles.stepSub}>{s.sub}</span> : null}
        </li>
      ))}
    </ol>
  );
}
