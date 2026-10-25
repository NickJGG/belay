import type { Mark } from "@/lib/data";
import type { QuestionStatus, QuestionSummary } from "@/lib/sessions";
import { cn } from "@/lib/utils";
import styles from "./session-nav.module.css";

export type SessionNav = {
  slug: string;
  topic: string;
  project?: string;
  /** The project it's filed under; null when unfiled. */
  mark: Mark | null;
  status: string;
  live: boolean;
  /** Null for a session without session.json (an old grill session). */
  questions: QuestionSummary[] | null;
  /** Its project's page, or Unfiled's. */
  back: string;
};

const MARK: Record<QuestionStatus, string> = { open: "●", resolved: "✓", deferred: "–", dropped: "✕", see: "↪" };

/** A grill's questions, nested under it in the expanded sidebar. */
export function SessionQuestions({ session: s }: { session: SessionNav }) {
  if (s.questions === null) return <p className={styles.none}>Legacy session: no question list.</p>;
  if (s.questions.length === 0) return <p className={styles.none}>No questions yet.</p>;
  return (
    <ol className={styles.questions} aria-label="Questions">
      {s.questions.map((q) => (
        <li key={q.n}>
          <a href={`#q-${q.n}`} className={cn(styles.q, q.status === "open" && styles.qOpen)} title={q.title}>
            <span className={styles.qn}>Q{q.n}</span>
            <span className={styles.label}>{q.short}</span>
            <span className={cn(styles.qs, styles[`qs-${q.status}`])} aria-label={q.status}>
              {MARK[q.status]}
            </span>
          </a>
        </li>
      ))}
    </ol>
  );
}
