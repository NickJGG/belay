import Link from 'next/link';
import { PenLine } from 'lucide-react';
import { firstLine } from '../../src/logs.ts';
import type { TimelineDay, TimelineEvent } from '../../src/home.ts';
import { IssueLink, idColumn, logHref } from '@/components/bits';
import { Group } from '@/components/StatusGroup';
import { StatusIcon } from '@/components/StatusIcon';
import ui from '@/components/ui.module.css';
import { dayLabel, shortDay } from '@/lib/days';
import styles from './Home.module.css';

function Event({ e }: { e: TimelineEvent }) {
  if (e.type === 'transition') {
    return (
      <li className={`${ui.row} ${styles.event}`}>
        <StatusIcon status={e.to} />
        <span className={ui.idTitle}>
          <IssueLink id={e.issue.id} stretch className={ui.idCol} />
          <span className={ui.grow}>{e.issue.title}</span>
        </span>
      </li>
    );
  }
  const { entry } = e;
  return (
    <li className={`${ui.row} ${styles.event}`}>
      <PenLine className={ui.muted} size={14} aria-label="Log entry" />
      <Link className={`${ui.grow} ${ui.stretch}`} href={logHref(entry.day, entry.n, entry.at)}>
        {firstLine(entry.text).line}
      </Link>
    </li>
  );
}

/** Work days newest first on a vertical rail, each a collapsible group; runs of empty days collapse to one muted label. */
export function Timeline({ days, today, earlierHref }: { days: TimelineDay[]; today: string; earlierHref: string }) {
  const issues = days.flatMap((d) => ('day' in d ? d.events.flatMap((e) => (e.type === 'transition' ? [e.issue] : [])) : []));
  return (
    <div className={styles.timeline} style={idColumn(issues)}>
      {days.map((d) =>
        'gap' in d ? (
          <section key={d.gap.to} className={styles.tlDay} data-gap>
            <h3 className={styles.tlHead}>
              {d.gap.from === d.gap.to ? dayLabel(d.gap.from, today) : `${shortDay(d.gap.from, today)}–${shortDay(d.gap.to, today)}`}
            </h3>
          </section>
        ) : (
          <section key={d.day} className={styles.tlDay}>
            <Group id={`day-${d.day}`} icon={<span className={styles.node} />} label={dayLabel(d.day, today)} count={d.events.length}>
              <ul className={ui.rows}>
                {d.events.map((e) => (
                  <Event key={e.type === 'log' ? `log-${e.entry.n}-${e.at}` : `${e.issue.id}-${e.at}`} e={e} />
                ))}
              </ul>
            </Group>
          </section>
        ),
      )}
      <Link className={`${ui.link} ${styles.earlier}`} href={earlierHref}>
        Show earlier →
      </Link>
    </div>
  );
}
