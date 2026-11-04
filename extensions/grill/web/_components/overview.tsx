import { Facts, None } from "@/components/belay/facts";
import { IssueRows } from "@/components/belay/issue-rows";
import { shortDate, statusLabel } from "@/lib/format";
import type { GrillIssue } from "../_lib/detail.server";
import { decidedCount, type SessionDoc } from "../_lib/session-doc";
import styles from "./workspace.module.css";

const STATUS: Record<string, string> = { "in-progress": "Grilling", planned: "Planned", abandoned: "Abandoned" };

/** A grill's status card: what it's about, how far it got, where it stands and the issues it filed. */
export function Overview({ doc, issues }: { doc: SessionDoc; issues: GrillIssue[] }) {
  const { decided, total, segs } = decidedCount(doc);
  const next = doc.status === "in-progress" ? [...doc.questions].reverse().find((q) => q.status === "open") : undefined;
  const updated = shortDate(doc.updated);
  return (
    <div className={styles.overview}>
      <h2 className={styles.ovTitle}>{doc.topic}</h2>
      {doc.about ? <p className={styles.ovAbout}>{doc.about}</p> : null}
      <Facts
        facts={[
          ["Status", STATUS[doc.status] ?? statusLabel(doc.status)],
          [
            "Decided",
            <>
              {decided} of {total}
              {segs.length ? (
                <span className={styles.ovSegs} aria-hidden>
                  {segs.map((s, i) => (
                    <i key={i} className={styles[`ovSeg-${s}`]} />
                  ))}
                </span>
              ) : null}
            </>,
          ],
          ["Updated", updated || <None />],
        ]}
      />
      {next ? (
        <p className={styles.ovWhere}>
          Next:{" "}
          <a href={`#q-${next.n}`}>
            Q{next.n} · {next.title}
          </a>
        </p>
      ) : doc.open ? (
        <p className={styles.ovWhere}>{doc.open}</p>
      ) : null}
      {issues.length ? (
        <section className={styles.ovSec}>
          <h3>Issues</h3>
          <IssueRows issues={issues} />
        </section>
      ) : null}
    </div>
  );
}
