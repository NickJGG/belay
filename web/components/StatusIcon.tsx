import type { TaskStatus } from '@/lib/types';
import styles from './StatusIcon.module.css';

const SHAPES: Record<TaskStatus, React.ReactNode> = {
  idea: <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.4" strokeDasharray="2.2 1.9" />,
  todo: <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.4" />,
  doing: (
    <>
      <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M7 3.2a3.8 3.8 0 0 1 0 7.6z" fill="currentColor" />
    </>
  ),
  done: (
    <>
      <circle cx="7" cy="7" r="6.2" fill="currentColor" />
      <path d="M4.3 7.2l1.8 1.8 3.6-3.8" fill="none" stroke="var(--bg)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  dropped: (
    <>
      <circle cx="7" cy="7" r="5.5" fill="none" stroke="currentColor" strokeWidth="1.4" />
      <path d="M3.3 10.7l7.4-7.4" stroke="currentColor" strokeWidth="1.4" />
    </>
  ),
};

export function StatusIcon({ status, size = 14 }: { status: TaskStatus; size?: number }) {
  return (
    <svg className={`${styles.icon} ${styles[status]}`} width={size} height={size} viewBox="0 0 14 14" role="img" aria-label={status}>
      {SHAPES[status]}
    </svg>
  );
}
