import Link from "next/link";
import type { Issue } from "../../../../src/store.ts";
import { ProjectMark } from "@/components/project-mark";
import type { Mark } from "@/lib/data";
import { issueHref } from "@/lib/hrefs";
import { cn } from "@/lib/utils";
import { StatusIcon } from "./status-icon";
import styles from "./belay.module.css";

/** Sizes every row's key column under it to the longest of `ids`. */
export const keyColumn = (ids: string[]) => ({ "--key-w": `${Math.max(0, ...ids.map((id) => id.length))}ch` }) as React.CSSProperties;

/**
 * Belay's issue rows: status icon, the project's mark when the issue carries one (Home), mono key, title, and ! when
 * high priority. The row opens the issue.
 */
export function IssueRows({
  issues,
  status = true,
}: {
  issues: (Pick<Issue, "id" | "title" | "status" | "priority"> & { mark?: Mark | null })[];
  status?: boolean;
}) {
  return (
    <ul className={styles.rows}>
      {issues.map((t) => (
        <li key={t.id} className={styles.row}>
          {status ? <StatusIcon status={t.status} /> : null}
          {t.mark !== undefined ? <ProjectMark mark={t.mark} /> : null}
          <span className={styles.keyTitle}>
            <Link className={cn(styles.key, styles.stretch)} href={issueHref(t.id)}>
              {t.id}
            </Link>
            <span className={styles.grow}>{t.title}</span>
          </span>
          {t.priority === "high" ? (
            <span className={styles.high} title="High priority">
              !
            </span>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
