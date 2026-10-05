'use client';
/** Text that saves itself on blur or Enter. `save` is usually a server action bound to its record. */
import { useState, useTransition } from 'react';
import type { Result } from '@/app/actions';
import { toastError } from './Toaster';
import styles from './InlineEdit.module.css';

type Save = (value: string) => Promise<Result>;

export function TitleEdit({ value, label, save }: { value: string; label: string; save: Save }) {
  const [editing, setEditing] = useState(false);
  const [pending, start] = useTransition();

  const commit = (v: string) => {
    setEditing(false);
    if (v.trim() === value) return;
    start(async () => {
      const r = await save(v);
      if (r.error) toastError(r.error);
    });
  };

  if (!editing) {
    return (
      <h1 className={styles.title}>
        <button type="button" className={styles.titleBtn} title={`Edit ${label.toLowerCase()}`} onClick={() => setEditing(true)} disabled={pending}>
          {value}
        </button>
      </h1>
    );
  }
  return (
    <input
      className={styles.titleInput}
      aria-label={label}
      defaultValue={value}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') setEditing(false);
      }}
    />
  );
}

/** Keyed on `value`, so a save from elsewhere replaces what's shown. */
export function TextEdit({ value, label, placeholder, save }: { value: string; label: string; placeholder?: string; save: Save }) {
  const [, start] = useTransition();

  const commit = (el: HTMLInputElement) => {
    if (el.value.trim() === value) return;
    start(async () => {
      const r = await save(el.value);
      if (r.error) {
        toastError(r.error);
        el.value = value;
      }
    });
  };

  return (
    <input
      key={value}
      className={styles.text}
      aria-label={label}
      placeholder={placeholder}
      defaultValue={value}
      onBlur={(e) => commit(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === 'Enter') e.currentTarget.blur();
        if (e.key === 'Escape') {
          e.currentTarget.value = value;
          e.currentTarget.blur();
        }
      }}
    />
  );
}
