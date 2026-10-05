'use client';
import { useTransition } from 'react';
import { setIssueBlockers } from '@/app/actions';
import type { Ref } from '@/components/Chip';
import { IssuePicker } from '@/components/IssuePicker';
import { toastError } from '@/components/Toaster';

export function Blockers({ id, project, blockers, candidates }: { id: string; project: string; blockers: Ref[]; candidates: Ref[] }) {
  const [pending, start] = useTransition();
  const save = (next: string[]) =>
    start(async () => {
      const r = await setIssueBlockers(id, next);
      if (r.error) toastError(r.error);
    });
  return <IssuePicker label="Blocked by" value={blockers} onChange={save} candidates={candidates} preferProject={project} disabled={pending} />;
}
