'use client';
import { useState, useTransition } from 'react';
import { setTaskTitle } from '@/app/actions';
import { toastError } from '@/components/Toaster';
import styles from './task.module.css';

export function TitleEdit({ id, title }: { id: string; title: string }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();

  const save = (value: string) => {
    setEditing(false);
    if (value.trim() === title) return;
    start(async () => {
      const r = await setTaskTitle(id, value);
      if (r.error) toastError(r.error);
    });
  };

  if (!editing) {
    return (
      <h1 className={styles.title}>
        <button type="button" className={styles.titleBtn} title="Edit title" onClick={() => setEditing(true)} disabled={pending}>
          {title}
        </button>
      </h1>
    );
  }
  return (
    <input
      className={styles.titleInput}
      aria-label="Title"
      defaultValue={title}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => save(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setEditing(false);
      }}
    />
  );
}
