/** Small shared pieces for task and project rows. */
import Link from 'next/link';
import type { Task } from '@/lib/types';
import ui from './ui.module.css';

export function Flags({ task }: { task: Pick<Task, 'priority' | 'source'> }) {
  return (
    <>
      {task.priority === 'high' && (
        <span className={ui.high} title="High priority">
          !!
        </span>
      )}
      {task.source === 'claude' && <span className={ui.src}>claude</span>}
    </>
  );
}

export const projectHref = (key: string) => `/p/${encodeURIComponent(key)}`;

export const taskHref = (id: string) => `/t/${encodeURIComponent(id)}`;

/** `stretch` makes the link cover its whole `ui.row`. */
export function TaskLink({ id, stretch }: { id: string; stretch?: boolean }) {
  return (
    <Link className={`${ui.mono} ${ui.muted} ${stretch ? ui.stretch : ''}`} href={taskHref(id)}>
      {id}
    </Link>
  );
}
