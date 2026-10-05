import Link from 'next/link';
import type { DatedEntry } from '../../../../src/logs.ts';
import { IssueLink } from '@/components/bits';
import ui from '@/components/ui.module.css';
import { addDays } from '@/lib/data';
import { LogDelete } from './LogDelete';
import styles from './page.module.css';

function dayLabel(day: string, today: string): string {
  if (day === today) return 'Today';
  if (day === addDays(today, -1)) return 'Yesterday';
  const [y, m, d] = day.split('-').map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString('en', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    ...(day.slice(0, 4) !== today.slice(0, 4) && { year: 'numeric' }),
  });
}

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
      {!days.size && (
        <p className={ui.empty}>
          No log entries{older ? ' lately' : ''}. Press <kbd className={ui.kbd}>L</kbd> to log work.
        </p>
      )}
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
                const address = `${e.day}/${e.n}`;
                return (
                  <li key={`${address}-${e.at}`} className={`${ui.row} ${styles.logRow}`}>
                    <time className={`${ui.mono} ${ui.muted}`} dateTime={e.at} title={`Logged ${e.at.replace('T', ' ')}`}>
                      {e.at.slice(11)}
                    </time>
                    <span className={styles.logText}>{e.text}</span>
                    {e.kind && (
                      <span className={styles.badge}>
                        {e.kind}
                        {(e.count ?? 1) > 1 && ` ×${e.count}`}
                      </span>
                    )}
                    {e.minutes && <span className={ui.muted}>{e.minutes}m</span>}
                    {e.issue && <IssueLink id={e.issue} />}
                    {e.by === 'claude' && <span className={ui.src}>claude</span>}
                    <LogDelete address={address} at={e.at} />
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
