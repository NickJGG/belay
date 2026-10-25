import Link from "next/link";
import type { CSSProperties } from "react";
import { projectColor } from "@/components/project-mark";
import { TurnDot } from "@/components/turn-dot";
import { flightWhy } from "@/lib/belay-view";
import type { HomeRow } from "@/lib/data";
import { grillHref, issueHref } from "@/lib/hrefs";
import styles from "./in-flight.module.css";

/** Home's In flight rows: kind, title over the project's hue and the key or slug, then where it stands. */
export function InFlight({ rows }: { rows: HomeRow[] }) {
  if (!rows.length) return <p className={styles.empty}>Nothing in flight.</p>;
  return (
    <ul className={styles.queue}>
      {rows.map((r) => {
        const ref = r.kind === "issue" ? r.id : r.slug;
        const hue = { "--hue": r.mark ? projectColor(r.mark) : "var(--line-strong)" } as CSSProperties;
        return (
          <li key={ref}>
            <Link href={r.kind === "issue" ? issueHref(r.id) : grillHref(r.slug)} className={styles.row}>
              <span className={styles.kind}>{r.kind}</span>
              <span className={styles.main}>
                <b>{r.kind === "issue" ? r.title : r.topic}</b>
                <small>
                  <i className={styles.hue} style={hue} aria-hidden />
                  {ref}
                </small>
              </span>
              <span className={styles.why}>
                {r.kind === "grill" && r.live ? <TurnDot working={!!r.working} /> : null}
                {flightWhy(r)}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
