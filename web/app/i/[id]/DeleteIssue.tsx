'use client';
import { useRef, useTransition } from 'react';
import { Trash2 } from 'lucide-react';
import { removeIssue } from '@/app/actions';
import { toastError } from '@/components/Toaster';
import ui from '@/components/ui.module.css';
import styles from './issue.module.css';

export function DeleteIssue({ id, dependents }: { id: string; dependents: { id: string; title: string }[] }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [pending, start] = useTransition();
  const confirm = () =>
    start(async () => {
      const r = await removeIssue(id);
      if (r?.error) {
        dialog.current?.close();
        toastError(r.error);
      }
    });

  return (
    <>
      <button type="button" className={styles.deleteBtn} onClick={() => dialog.current?.showModal()}>
        <Trash2 size={13} aria-hidden /> Delete issue
      </button>
      <dialog ref={dialog} className={styles.dialog} aria-labelledby="delete-title">
        <h2 id="delete-title" className={styles.dialogTitle}>
          Delete {id}?
        </h2>
        <p>This erases the issue file and can't be undone.</p>
        {dependents.length > 0 && (
          <>
            <p>It will be removed as a blocker from:</p>
            <ul className={styles.dependents}>
              {dependents.map((d) => (
                <li key={d.id}>
                  <span className={`${ui.mono} ${ui.muted}`}>{d.id}</span> {d.title}
                </li>
              ))}
            </ul>
          </>
        )}
        <div className={styles.dialogActions}>
          {/* autoFocus: showModal() focuses it, so Enter right after opening cancels. */}
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
