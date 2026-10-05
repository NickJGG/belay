'use client';
import { useTransition } from 'react';
import { openLinkedFile } from '@/app/actions';
import { toastError } from '@/components/Toaster';
import type { Linked } from '../../../../src/open.ts';
import styles from './issue.module.css';

export function OpenFile({ id, kind, path }: { id: string; kind: Linked; path: string }) {
  const [pending, start] = useTransition();
  const open = () =>
    start(async () => {
      const r = await openLinkedFile(id, kind);
      if (r.error) toastError(r.error);
    });

  return (
    <button type="button" className={styles.fileLink} title={path} onClick={open} disabled={pending}>
      {path.split(/[\\/]/).pop()}
    </button>
  );
}
