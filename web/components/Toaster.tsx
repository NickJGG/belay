'use client';
import { useEffect, useState } from 'react';
import styles from './Toaster.module.css';

const listeners = new Set<(msg: string) => void>();

export function toastError(msg: string) {
  for (const l of listeners) l(msg);
}

export function Toaster() {
  const [msg, setMsg] = useState<string>();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const show = (m: string) => {
      setMsg(m);
      clearTimeout(timer);
      timer = setTimeout(() => setMsg(undefined), 5000);
    };
    listeners.add(show);
    return () => {
      listeners.delete(show);
      clearTimeout(timer);
    };
  }, []);
  return (
    <div className={styles.region} role="status" aria-live="polite">
      {msg && (
        <button type="button" className={styles.toast} onClick={() => setMsg(undefined)}>
          {msg}
        </button>
      )}
    </div>
  );
}
