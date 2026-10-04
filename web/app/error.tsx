'use client';
import ui from '@/components/ui.module.css';

/** Most likely a malformed file in the data dir; the message names it in dev. */
export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className={ui.page}>
      <h1 className={ui.title}>Something went wrong</h1>
      <pre className={ui.muted}>{error.message}</pre>
      <button type="button" className={ui.btn} onClick={reset}>
        Retry
      </button>
    </div>
  );
}
