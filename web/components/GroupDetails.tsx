'use client';
import { ChevronRight } from 'lucide-react';
import { writeCollapsed } from '@/lib/collapsed';
import styles from './StatusGroup.module.css';

/**
 * A native <details>, so toggling needs no state here. `open` only changes when a refresh brings the
 * cookie this toggle just wrote, which then matches what's already on screen.
 */
export function GroupDetails({
  id,
  icon,
  label,
  count,
  open,
  defaultOpen,
  children,
}: {
  id: string;
  icon: React.ReactNode;
  label: string;
  count: number;
  open: boolean;
  defaultOpen: boolean;
  children: React.ReactNode;
}) {
  return (
    <details className={styles.group} open={open} onToggle={(e) => writeCollapsed(id, e.currentTarget.open !== defaultOpen)}>
      <summary className={styles.head}>
        <span className={styles.icon}>
          {icon}
          <ChevronRight size={14} className={styles.chevron} aria-hidden />
        </span>
        <span className={styles.label}>{label}</span> <span>{count}</span>
      </summary>
      {children}
    </details>
  );
}
