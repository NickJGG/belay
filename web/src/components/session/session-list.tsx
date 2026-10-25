import Link from "next/link";
import type { ReactNode } from "react";
import { ProjectMark } from "@/components/project-mark";
import { TurnDot } from "@/components/turn-dot";
import type { WorkItem } from "@/lib/data";
import { shortDate, statusLabel } from "@/lib/format";
import styles from "./session-list.module.css";

const issues = (n: number) => (n === 1 ? "1 issue" : `${n} issues`);

/** A row's stage-specific parts: the line under its topic, and what leads its right side. */
function work(s: WorkItem): { line?: string; lead: ReactNode } {
  if (s.live) return { line: s.open, lead: <span className={styles.cmd}>{s.working ? "Claude is working…" : "your turn"}</span> };
  if (s.stage === "grilling") return { line: s.open, lead: <code className={styles.cmd}>/sear resume {s.slug}</code> };
  if (s.stage === "building" && s.progress) {
    const { done, total } = s.progress;
    return {
      line: s.next && `${s.next.id} ${s.next.title} · ${statusLabel(s.next.status)}`,
      lead: (
        <span className={styles.progress}>
          <span className={styles.bar} aria-hidden>
            <i style={{ width: `${(done / total) * 100}%` }} />
          </span>
          {done}/{issues(total)}
        </span>
      ),
    };
  }
  if (s.status === "abandoned") return { lead: <span className={styles.cmd}>Abandoned</span> };
  return { lead: <span className={styles.done}>✓ {s.progress ? issues(s.progress.total) : "no issues"}</span> };
}

/**
 * Unfinished-work rows (and a project's shipped ones): a live row leads with whose turn it is, a grilling row
 * with its resume command, a building row with its next issue and progress, a shipped row with its issue count.
 */
export function WorkRows({ sessions, matched }: { sessions: WorkItem[]; matched?: Set<string> }) {
  return (
    <ul className={styles.rows}>
      {sessions.map((s) => {
        const { line, lead } = work(s);
        return (
          <li key={s.slug}>
            <Link href={`/s/${s.slug}`} className={styles.row}>
              <span className={styles.rowMain}>
                <span className={styles.rowSlug}>
                  {s.live ? <TurnDot working={!!s.working} /> : null}
                  <ProjectMark mark={s.mark} />
                  {s.slug}
                </span>
                <span className={styles.topic}>{s.topic}</span>
                {line ? <span className={styles.next}>{line}</span> : null}
              </span>
              <span className={styles.right}>
                {lead}
                <em>{[matched?.has(s.slug) ? "matched" : null, shortDate(s.updated)].filter(Boolean).join(" · ")}</em>
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
