import Link from 'next/link';
import { X } from 'lucide-react';
import type { IssueStatus } from '@/lib/types';
import { issueHref } from './bits';
import { StatusIcon } from './StatusIcon';
import ui from './ui.module.css';
import styles from './Chip.module.css';

export interface Ref {
  id: string;
  title?: string;
  /** Unset when the ID names no issue file. */
  status?: IssueStatus;
}

/** An issue reference. `link={false}` where navigating away would lose state, as in a modal. */
export function Chip({ r, onRemove, link = true }: { r: Ref; onRemove?: () => void; link?: boolean }) {
  const body = (
    <>
      {r.status ? <StatusIcon status={r.status} size={12} /> : <span className={ui.muted}>?</span>}
      <span className={ui.mono}>{r.id}</span>
    </>
  );
  const title = r.title ?? 'missing issue';
  return (
    <span className={styles.chip}>
      {link ? (
        <Link href={issueHref(r.id)} className={styles.link} title={title}>
          {body}
        </Link>
      ) : (
        <span className={styles.label} title={title}>
          {body}
        </span>
      )}
      {onRemove && (
        <button type="button" className={styles.x} aria-label={`Remove ${r.id}`} onClick={onRemove}>
          <X size={11} />
        </button>
      )}
    </span>
  );
}
