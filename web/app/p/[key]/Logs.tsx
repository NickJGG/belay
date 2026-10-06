import Link from 'next/link';
import { firstLine, type DatedEntry } from '../../../../src/logs.ts';
import { IssueLink, logHref } from '@/components/bits';
import ui from '@/components/ui.module.css';
import { dayLabel } from '@/lib/days';
import styles from './page.module.css';

/** `3 applied · 1 outreach` */
function kindTotals(entries: DatedEntry[]): string {
  const totals = new Map<string, number>();
  for (const e of entries) if (e.kind) totals.set(e.kind, (totals.get(e.kind) ?? 0) + (e.count ?? 1));
  return [...totals].map(([k, n]) => `${n} ${k}`).join(' · ');
}

/** The project's log entries, newest work day first. `entries` is oldest first, as loaded. */
export function Logs({ entries, today, older, moreHref }: { entries: DatedEntry[]; today: string; older: number; moreHref: string }) {
  const days = Map.groupBy(entries.toReversed(), (e) => e.day);
  return (
    <>
      {!days.size && <p className={ui.empty}>No logs.</p>}
      {[...days].map(([day, list]) => {
        const totals = kindTotals(list);
        return (
          <section key={day} className={styles.logDay}>
            <h3 className={ui.h3}>
              {dayLabel(day, today)}
              {totals && <span className={styles.totals}>{totals}</span>}
            </h3>
            <ul className={ui.rows}>
              {list.map((e) => {
                const { line, more } = firstLine(e.text);
                return (
                  <li key={`${e.day}/${e.n}-${e.at}`} className={`${ui.row} ${styles.logRow}`}>
                    <time className={`${ui.mono} ${ui.muted}`} dateTime={e.at} title={`Logged ${e.at.replace('T', ' ')}`}>
                      {e.at.slice(11)}
                    </time>
                    <Link className={`${styles.logText} ${ui.stretch}`} href={logHref(e.day, e.n, e.at)}>
                      {line}
                      {more && <span className={`${ui.muted} ${styles.moreMark}`}>more</span>}
                    </Link>
                    {e.kind && (
                      <span className={styles.badge}>
                        {e.kind}
                        {(e.count ?? 1) > 1 && ` ×${e.count}`}
                      </span>
                    )}
                    {e.minutes && <span className={ui.muted}>{e.minutes}m</span>}
                    {e.issue && (
                      <span className={styles.above}>
                        <IssueLink id={e.issue} />
                      </span>
                    )}
                    {e.by === 'claude' && <span className={ui.src}>claude</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}
      {older > 0 && (
        <Link className={`${ui.link} ${styles.more}`} href={moreHref}>
          {older} older {older === 1 ? 'entry' : 'entries'}
        </Link>
      )}
    </>
  );
}
