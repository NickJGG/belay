'use client';
import { useRef, useTransition } from 'react';
import { quickAdd } from '@/app/actions';
import { toastError } from '@/components/Toaster';
import ui from '@/components/ui.module.css';
import styles from './page.module.css';

export function QuickAdd({ projectKey }: { projectKey: string }) {
  const [pending, start] = useTransition();
  const form = useRef<HTMLFormElement>(null);
  return (
    <form
      ref={form}
      className={styles.add}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        start(async () => {
          const r = await quickAdd(projectKey, data.get('title'), data.get('status'));
          if (r.error) toastError(r.error);
          else form.current?.reset();
        });
      }}
    >
      <input className={`${ui.input} ${styles.addTitle}`} name="title" placeholder="New task title" aria-label="New task title" required autoComplete="off" />
      <select className={ui.input} name="status" aria-label="Status" defaultValue="idea">
        <option value="idea">idea</option>
        <option value="todo">todo</option>
      </select>
      <button type="submit" className={ui.primary} disabled={pending}>
        Add
      </button>
    </form>
  );
}
