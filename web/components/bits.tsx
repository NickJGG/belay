/** Small shared pieces for issue and project rows. */
import Link from 'next/link';
import type { Issue } from '@/lib/types';
import ui from './ui.module.css';

export function Flags({ issue }: { issue: Pick<Issue, 'priority' | 'source'> }) {
  return (
    <>
      {issue.priority === 'high' && (
        <span className={ui.high} title="High priority">
          !!
        </span>
      )}
      {issue.source === 'claude' && <span className={ui.src}>claude</span>}
    </>
  );
}

export const projectHref = (key: string) => `/p/${encodeURIComponent(key)}`;

export const issueHref = (id: string) => `/i/${encodeURIComponent(id)}`;

/** `stretch` makes the link cover its whole `ui.row`. */
export function IssueLink({ id, stretch }: { id: string; stretch?: boolean }) {
  return (
    <Link className={`${ui.mono} ${ui.muted} ${stretch ? ui.stretch : ''}`} href={issueHref(id)}>
      {id}
    </Link>
  );
}
