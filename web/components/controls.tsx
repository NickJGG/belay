'use client';
/** Issue and project controls whose value flips the moment they're used, and reverts if the write fails. */
import { useOptimistic, useTransition } from 'react';
import { Star } from 'lucide-react';
import { STATUS_KEYS as STATUSES } from '../../src/keys.ts';
import { setProjectFocus, setProjectStatus, setIssuePriority, setIssueStatus, type Result } from '@/app/actions';
import type { Project, ProjectStatus, Issue, IssueStatus } from '@/lib/types';
import { Flags, IssueLink } from './bits';
import { Dropdown } from './Dropdown';
import { useSelectable, useIssueKeys } from './Keys';
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

export const useStatus = (issue: Issue) => useOptimisticAction(issue.status, (s) => setIssueStatus(issue.id, s));
export const usePriority = (issue: Issue) => useOptimisticAction(issue.priority === 'high', (high) => setIssuePriority(issue.id, high));

export function IssueRow({ issue }: { issue: Issue }) {
  const [status, setStatus] = useStatus(issue);
  const [high, setHigh] = usePriority(issue);
  useIssueKeys(issue.id, { setStatus, setHigh });
  return (
    <li className={ui.row} {...useSelectable(issue.id)}>
      <StatusIcon status={status} />
      <span className={ui.idTitle}>
        <IssueLink id={issue.id} stretch className={ui.idCol} />
        <span className={ui.grow}>{issue.title}</span>
      </span>
      <Flags issue={{ ...issue, priority: high ? 'high' : undefined }} />
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

// src/store.ts holds the canonical list but imports node:fs; `satisfies` keeps this one complete.
const PROJECT_STATUSES = { active: 'Active', paused: 'Paused', archived: 'Archived' } satisfies Record<ProjectStatus, string>;

export function ProjectStatusSelect({ project, className }: { project: Project; className: string }) {
  const [status, setStatus] = useOptimisticAction(project.status, (s) => setProjectStatus(project.key, s));
  return (
    <Dropdown
      label="Status"
      value={status}
      options={Object.entries(PROJECT_STATUSES)}
      onChange={(s) => setStatus(s as ProjectStatus)}
      className={className}
    />
  );
}

export function StatusSelect({ issue, className }: { issue: Issue; className: string }) {
  const [status, setStatus] = useStatus(issue);
  useIssueKeys(issue.id, { setStatus });
  return (
    <label className={className} title="Status (1–5)">
      <StatusIcon status={status} />
      <select aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as IssueStatus)}>
        {STATUSES.map((s) => (
          <option key={s} value={s}>
            {s}
          </option>
        ))}
      </select>
    </label>
  );
}

export function PrioritySelect({ issue, className }: { issue: Issue; className: string }) {
  const [high, setHigh] = usePriority(issue);
  useIssueKeys(issue.id, { setHigh });
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
