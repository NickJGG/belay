'use client';
/** Task and project controls whose value flips the moment they're used, and reverts if the write fails. */
import { useOptimistic, useTransition } from 'react';
import { Star } from 'lucide-react';
import { STATUS_KEYS as STATUSES } from '../../src/keys.ts';
import { setProjectFocus, setTaskPriority, setTaskStatus, type Result } from '@/app/actions';
import type { Project, Task, TaskStatus } from '@/lib/types';
import { Flags, TaskLink } from './bits';
import { useSelectable, useTaskKeys } from './Keys';
import { StatusIcon } from './StatusIcon';
import { toastError } from './Toaster';
import ui from './ui.module.css';

function useOptimisticAction<T>(value: T, action: (v: T) => Promise<Result>): [T, (v: T) => void] {
  const [shown, setShown] = useOptimistic(value);
  const [, start] = useTransition();
  const set = (v: T) =>
    start(async () => {
      setShown(v);
      const r = await action(v);
      if (r.error) toastError(r.error);
    });
  return [shown, set];
}

export const useStatus = (task: Task) => useOptimisticAction(task.status, (s) => setTaskStatus(task.id, s));
export const usePriority = (task: Task) => useOptimisticAction(task.priority === 'high', (high) => setTaskPriority(task.id, high));

const STATUS_ACTIONS: Record<TaskStatus, [string, TaskStatus][]> = {
  idea: [['todo', 'todo'], ['drop', 'dropped']],
  todo: [['start', 'doing'], ['drop', 'dropped']],
  doing: [['done', 'done'], ['back to todo', 'todo']],
  done: [['reopen', 'todo']],
  dropped: [['reopen', 'todo']],
};

export function StatusButtons({ status, set }: { status: TaskStatus; set: (s: TaskStatus) => void }) {
  return STATUS_ACTIONS[status].map(([label, to]) => (
    <button key={to} type="button" className={ui.btn} title={`Set status to ${to} (${STATUSES.indexOf(to) + 1})`} onClick={() => set(to)}>
      {label}
    </button>
  ));
}

export function TaskRow({ task }: { task: Task }) {
  const [status, setStatus] = useStatus(task);
  const [high, setHigh] = usePriority(task);
  useTaskKeys(task.id, { setStatus, setHigh });
  return (
    <li className={ui.row} {...useSelectable(task.id)}>
      <StatusIcon status={status} />
      <TaskLink id={task.id} />
      <span className={ui.grow}>{task.title}</span>
      <Flags task={{ ...task, priority: high ? 'high' : undefined }} />
      <span className={ui.actions}>
        <StatusButtons status={status} set={setStatus} />
      </span>
    </li>
  );
}

export function FocusToggle({ project }: { project: Project }) {
  const [focus, setFocus] = useOptimisticAction(project.focus, (f) => setProjectFocus(project.key, f));
  return (
    <button type="button" className={focus ? ui.starOn : ui.icon} title={focus ? 'Remove focus' : 'Focus'} aria-label={focus ? 'Remove focus' : 'Focus'} aria-pressed={focus} onClick={() => setFocus(!focus)}>
      <Star size={14} fill={focus ? 'currentColor' : 'none'} />
    </button>
  );
}

export function StatusSelect({ task, className }: { task: Task; className: string }) {
  const [status, setStatus] = useStatus(task);
  useTaskKeys(task.id, { setStatus });
  return (
    <label className={className} title="Status (1–5)">
      <StatusIcon status={status} />
      <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as TaskStatus)}>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PrioritySelect({ task, className }: { task: Task; className: string }) {
  const [high, setHigh] = usePriority(task);
  useTaskKeys(task.id, { setHigh });
  return (
    <label className={className}>
      <span className={high ? ui.high : ui.muted} aria-hidden>
        !!
      </span>
      <select aria-label="Priority" value={high ? 'high' : 'none'} onChange={(e) => setHigh(e.target.value === 'high')}>
        <option value="none">No priority</option>
        <option value="high">High</option>
      </select>
    </label>
  );
}
