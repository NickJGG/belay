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

/** Same mark as `app/icon.svg`, but in the live accent rather than the favicon's fixed coral. */
export function Logo() {
  return (
    <svg className={ui.logo} viewBox="0 0 32 32" aria-hidden>
      <rect width="32" height="32" rx="7" />
      <g transform="translate(3.52 3.52) scale(0.78)">
        <path strokeWidth="3" d="M11 8.5 A5 5 0 0 1 16 3.5 H18 A7 7 0 0 1 25 10.5 V21.5 A7 7 0 0 1 18 28.5 H15 A5 5 0 0 1 10 23.5 L11 8.5" />
        <path strokeWidth="6.5" d="M10.3 20.5 L10.7 14.5" />
      </g>
    </svg>
  );
}
