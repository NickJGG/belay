'use client';
import { useState, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { deleteLogEntry } from '@/app/actions';
import { toastError } from '@/components/Toaster';
import ui from '@/components/ui.module.css';
import styles from './page.module.css';

export function LogDelete({ address, at }: { address: string; at: string }) {
  const [asking, setAsking] = useState(false);
  const [pending, start] = useTransition();
  const remove = () =>
    start(async () => {
      const r = await deleteLogEntry(address, at);
      if (r.error) toastError(r.error);
      setAsking(false);
    });
  if (!asking) {
    return (
      <button
        type="button"
        className={`${ui.icon} ${styles.logDelete}`}
        title="Delete"
        aria-label={`Delete log entry ${address}`}
        onClick={() => setAsking(true)}
      >
        <Trash2 size={13} aria-hidden />
      </button>
    );
  }
  return (
    <span className={styles.confirm}>
      Delete?
      <button type="button" className={ui.link} onClick={remove} disabled={pending}>
        Yes
      </button>
      <button type="button" className={ui.link} onClick={() => setAsking(false)} disabled={pending} autoFocus>
        No
      </button>
    </span>
  );
}
