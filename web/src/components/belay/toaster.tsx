"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import styles from "./toaster.module.css";

type Toast = { msg: string; bad: boolean };

const listeners = new Set<(t: Toast) => void>();

/** Shows a failed write's message for a few seconds. */
export function toastError(msg: string) {
  for (const l of listeners) l({ msg, bad: true });
}

/** Shows a note for a few seconds, such as what was copied. */
export function toast(msg: string) {
  for (const l of listeners) l({ msg, bad: false });
}

export function Toaster() {
  const [shown, setShown] = useState<Toast>();
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const show = (t: Toast) => {
      setShown(t);
      clearTimeout(timer);
      timer = setTimeout(() => setShown(undefined), 5000);
    };
    listeners.add(show);
    return () => {
      listeners.delete(show);
      clearTimeout(timer);
    };
  }, []);
  return (
    <div className={styles.region} role="status" aria-live="polite">
      {shown && (
        <button type="button" className={cn(styles.toast, shown.bad && styles.bad)} onClick={() => setShown(undefined)}>
          {shown.msg}
        </button>
      )}
    </div>
  );
}
