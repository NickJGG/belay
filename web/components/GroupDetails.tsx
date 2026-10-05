'use client';
import { ChevronRight } from 'lucide-react';
import { writeCollapsed } from '@/lib/collapsed';
import type { TaskStatus } from '@/lib/types';
import { StatusIcon } from './StatusIcon';
import styles from './StatusGroup.module.css';

/**
 * A native <details>, so toggling needs no state here. `open` only changes when a refresh brings the
 * cookie this toggle just wrote, which then matches what's already on screen.
 */
export function GroupDetails({ status, count, open, children }: { status: TaskStatus; count: number; open: boolean; children: React.ReactNode }) {
  return (
    <details className={styles.group} open={open} onToggle={(e) => writeCollapsed(status, !e.currentTarget.open)}>
      <summary className={styles.head}>
        <span className={styles.icon}>
          <StatusIcon status={status} />
          <ChevronRight size={14} className={styles.chevron} aria-hidden />
        </span>
        <span className={styles.label}>{status[0].toUpperCase() + status.slice(1)}</span> <span>{count}</span>
      </summary>
      {children}
    </details>
  );
}
