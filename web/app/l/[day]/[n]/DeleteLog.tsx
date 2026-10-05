'use client';
import { useRef, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { deleteLogEntry } from '@/app/actions';
import { toastError } from '@/components/Toaster';
import ui from '@/components/ui.module.css';
import styles from '../../../i/[id]/issue.module.css';

export function DeleteLog({ address, at }: { address: string; at: string }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const confirm = () =>
    start(async () => {
      const r = await deleteLogEntry(address, at);
      if (r?.error) {
        dialog.current?.close();
        toastError(r.error);
      }
    });

  return (
    <>
      <button type="button" className={styles.deleteBtn} onClick={() => dialog.current?.showModal()}>
        <Trash2 size={13} aria-hidden /> Delete entry
      </button>
      <dialog ref={dialog} className={styles.dialog} aria-labelledby="delete-title">
        <h2 id="delete-title" className={styles.dialogTitle}>
          Delete log entry {address}?
        </h2>
        <p>This can't be undone, and later entries on that day move up one number.</p>
        <div className={styles.dialogActions}>
          <button type="button" className={ui.btn} autoFocus onClick={() => dialog.current?.close()} disabled={pending}>
            Cancel
          </button>
          <button type="button" className={styles.danger} onClick={confirm} disabled={pending}>
            Delete
          </button>
        </div>
      </dialog>
    </>
  );
}
