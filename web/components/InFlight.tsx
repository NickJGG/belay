import { MessagesSquare } from 'lucide-react';
import Link from 'next/link';
import type { InFlight as InFlightData } from '../../src/home.ts';
import { IssueLink, grillHref, idColumn } from '@/components/bits';
import { StatusIcon } from '@/components/StatusIcon';
import ui from '@/components/ui.module.css';

/** Doing issues, then grill sessions still waiting on an issue; each row links to its page. */
export function InFlight({ data }: { data: InFlightData }) {
  if (!data.issues.length && !data.grill.length) return <p className={ui.empty}>Nothing in flight.</p>;
  return (
    <ul className={ui.rows} style={idColumn(data.issues.map((r) => r.issue))}>
      {data.issues.map(({ issue }) => (
        <li key={issue.id} className={ui.row}>
          <StatusIcon status="doing" />
          <span className={ui.idTitle}>
            <IssueLink id={issue.id} stretch className={ui.idCol} />
            <span className={ui.grow}>{issue.title}</span>
          </span>
        </li>
      ))}
      {data.grill.map((g) => (
        <li key={g.slug} className={ui.row}>
          <MessagesSquare className={ui.muted} size={14} aria-label="Grill session" />
          <Link className={`${ui.grow} ${ui.stretch}`} href={grillHref(g.slug)} title={g.slug}>
            {g.topic || g.slug}
          </Link>
        </li>
      ))}
    </ul>
  );
}
