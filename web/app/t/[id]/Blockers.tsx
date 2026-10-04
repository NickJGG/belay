'use client';
import Link from 'next/link';
import { useState, useTransition } from 'react';
import { X } from 'lucide-react';
import { setTaskBlockers } from '@/app/actions';
import { taskHref } from '@/components/bits';
import { StatusIcon } from '@/components/StatusIcon';
import { toastError } from '@/components/Toaster';
import ui from '@/components/ui.module.css';
import type { TaskStatus } from '@/lib/types';
import styles from './task.module.css';

export interface Ref {
  id: string;
  title?: string;
  /** Unset when the ID names no task file. */
  status?: TaskStatus;
}

export function Chip({ r, onRemove }: { r: Ref; onRemove?: () => void }) {
  return (
    <span className={styles.chip}>
      <Link href={taskHref(r.id)} className={styles.chipLink} title={r.title ?? 'missing task'}>
        {r.status ? <StatusIcon status={r.status} size={12} /> : <span className={ui.muted}>?</span>}
        <span className={ui.mono}>{r.id}</span>
      </Link>
      {onRemove && (
        <button type="button" className={styles.chipX} aria-label={`Remove blocker ${r.id}`} onClick={onRemove}>
          <X size={11} />
        </button>
      )}
    </span>
  );
}

export function Blockers({ id, blockers, candidates }: { id: string; blockers: Ref[]; candidates: Ref[] }) {
  const [pending, start] = useTransition();
  const [draft, setDraft] = useState('');
  const ids = blockers.map((b) => b.id);
  const save = (next: string[]) =>
    start(async () => {
      const r = await setTaskBlockers(id, next);
      if (r.error) toastError(r.error);
      else setDraft('');
    });
  const options = candidates.filter((c) => !ids.includes(c.id));

  return (
    <div className={styles.blockers}>
      {blockers.map((b) => (
        <Chip key={b.id} r={b} onRemove={pending ? undefined : () => save(ids.filter((x) => x !== b.id))} />
      ))}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const add = draft.trim().split(/\s/)[0];
          if (add) save([...ids, add]);
        }}
      >
        <input
          className={styles.addBlocker}
          list={`${id}-candidates`}
          placeholder="Add blocker…"
          aria-label="Add blocker"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          disabled={pending}
        />
        <datalist id={`${id}-candidates`}>
          {options.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </datalist>
      </form>
    </div>
  );
}
