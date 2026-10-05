'use client';
import { PageBar } from '@/components/PageBar';
import ui from '@/components/ui.module.css';

/** Most likely a malformed file in the data dir; the message names it in dev. */
export default function ErrorPage({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <>
      <PageBar crumbs={[{ label: 'Something went wrong' }]} />
      <div className={ui.page}>
        <pre className={ui.muted}>{error.message}</pre>
        <button type="button" className={ui.btn} onClick={reset}>
          Retry
        </button>
      </div>
    </>
  );
}
