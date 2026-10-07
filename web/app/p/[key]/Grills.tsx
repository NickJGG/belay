import { MessagesSquare } from 'lucide-react';
import Link from 'next/link';
import { Fragment } from 'react';
import type { GrillSession } from '../../../../src/grill.ts';
import { IssueLink, grillHref } from '@/components/bits';
import ui from '@/components/ui.module.css';
import type { Issue } from '@/lib/types';
import styles from './page.module.css';

/** The project's tagged grill sessions in the order given, each with the issues that link to it. */
export function Grills({ sessions, issues }: { sessions: GrillSession[]; issues: Issue[] }) {
  if (!sessions.length) return <p className={ui.empty}>No grill sessions tagged with this project.</p>;
  return (
    <ul className={ui.rows}>
      {sessions.map((g) => {
        const linked = issues.filter((t) => t.grill === g.slug);
        return (
          <li key={g.slug} className={ui.row}>
            <MessagesSquare className={ui.muted} size={14} aria-label="Grill session" />
            <Link className={`${ui.grow} ${ui.stretch}`} href={grillHref(g.slug)} title={g.slug}>
              {g.topic || g.slug}
            </Link>
            {linked.length > 0 && (
              <span className={`${ui.muted} ${styles.above}`}>
                {linked.map((t, i) => (
                  <Fragment key={t.id}>
                    {i > 0 && ', '}
                    <IssueLink id={t.id} />
                  </Fragment>
                ))}
              </span>
            )}
          </li>
        );
      })}
    </ul>
  );
}
