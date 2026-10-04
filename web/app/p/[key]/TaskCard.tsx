'use client';
import { useDraggable } from '@dnd-kit/core';
import { Flags, TaskLink } from '@/components/bits';
import { StatusButtons, usePriority } from '@/components/controls';
import { useSelectable, useTaskKeys } from '@/components/Keys';
import { StatusIcon } from '@/components/StatusIcon';
import ui from '@/components/ui.module.css';
import type { Task, TaskStatus } from '@/lib/types';
import styles from './page.module.css';

/** `children` is the server-rendered detail shown when the card is expanded. The board owns `status`. */
export function TaskCard({ task, status, setStatus, children }: { task: Task; status: TaskStatus; setStatus: (s: TaskStatus) => void; children: React.ReactNode }) {
  const [high, setHigh] = usePriority(task);
  useTaskKeys(task.id, { setStatus, setHigh });
  // Only the summary starts a drag, so text in the open detail stays selectable.
  const { setNodeRef, listeners, isDragging } = useDraggable({ id: task.id });
  return (
    <details ref={setNodeRef} className={`${styles.card} ${isDragging ? styles.dragging : ''}`} {...useSelectable(task.id)}>
      <summary className={styles.summary} {...listeners}>
        <StatusIcon status={status} />
        <TaskLink id={task.id} />
        <Flags task={{ ...task, priority: high ? 'high' : undefined }} />
        <span className={styles.cardTitle}>{task.title}</span>
      </summary>
      <div className={styles.cardBody}>
        <div className={styles.cardActions}>
          <StatusButtons status={status} set={setStatus} />
          <button type="button" className={ui.btn} onClick={() => setHigh(!high)}>
            {high ? 'unset !!' : '!!'}
          </button>
        </div>
        {children}
      </div>
    </details>
  );
}
