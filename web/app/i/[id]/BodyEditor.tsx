'use client';
import { useEffect, useState, useTransition } from 'react';
import { saveIssueBody } from '@/app/actions';
import { useIssueKeys } from '@/components/Keys';
import { Markdown } from '@/components/Markdown';
import { toastError } from '@/components/Toaster';
import ui from '@/components/ui.module.css';
import styles from './issue.module.css';

type Mode = 'view' | 'edit' | 'conflict';

/**
 * `body` and `hash` are what's on disk now: live sync refreshes them under an open editor, so a
 * `hash` that no longer matches the one editing started from means someone else changed the file.
 * The draft is only ever dropped by the user cancelling.
 */
export function BodyEditor({ id, body, hash }: { id: string; body: string; hash: string }) {
  const [mode, setMode] = useState<Mode>('view');
  const [draft, setDraft] = useState('');
  const [original, setOriginal] = useState('');
  const [base, setBase] = useState(hash);
  const [preview, setPreview] = useState(false);
  const [disk, setDisk] = useState({ body: '', hash: '' });
  const [pending, start] = useTransition();
  const dirty = mode !== 'view' && draft !== original;
  const stale = mode === 'edit' && hash !== base;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const edit = () => {
    setDraft(body);
    setOriginal(body);
    setBase(hash);
    setPreview(false);
    setMode('edit');
  };

  useIssueKeys(id, { edit: mode === 'view' ? edit : undefined });

  const cancel = () => {
    if (dirty && !window.confirm('Discard your draft?')) return;
    setMode('view');
  };

  const save = (expected: string) =>
    start(async () => {
      const r = await saveIssueBody(id, draft, expected);
      if (r.conflict !== undefined) {
        setDisk({ body: r.conflict, hash: r.hash! });
        setMode('conflict');
      } else if (r.error) {
        toastError(r.error);
      } else {
        setBase(r.hash!);
        setMode('view');
      }
    });

  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save(mode === 'conflict' ? disk.hash : base);
    if (e.key === 'Escape') cancel();
  };

  if (mode === 'view') {
    return (
      <section className={styles.body}>
        {body ? (
          <Markdown>{body}</Markdown>
        ) : (
          <button type="button" className={styles.placeholder} onClick={edit}>
            Add a description…
          </button>
        )}
        {body && (
          <div className={styles.bodyActions}>
            <button type="button" className={ui.btn} title="Edit (E)" onClick={edit}>
              Edit
            </button>
          </div>
        )}
      </section>
    );
  }

  if (mode === 'conflict') {
    return (
      <section className={styles.body}>
        <div className={styles.conflictNote} role="alert">
          The description changed on disk while you were editing. Merge by hand: your draft is on the left, the file as it is now on the right.
          Saving replaces the file with your draft.
        </div>
        <div className={styles.conflict}>
          <label className={styles.pane}>
            <span className={styles.paneHead}>Your draft</span>
            <textarea className={styles.textarea} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={keys} rows={16} />
          </label>
          <div className={styles.pane}>
            <span className={styles.paneHead}>On disk</span>
            <pre className={styles.diskBody}>{disk.body || '(empty)'}</pre>
          </div>
        </div>
        <div className={styles.bodyActions}>
          <button type="button" className={ui.btn} onClick={() => setMode('edit')} disabled={pending}>
            Back to editor
          </button>
          <button type="button" className={ui.primary} onClick={() => save(disk.hash)} disabled={pending}>
            Save my draft
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.body}>
      {stale && (
        <div className={styles.stale} role="status">
          Changed on disk since you started editing.
          <button
            type="button"
            className={ui.link}
            onClick={() => {
              setDisk({ body, hash });
              setMode('conflict');
            }}
          >
            Compare
          </button>
        </div>
      )}
      <div className={styles.tabs} role="tablist">
        <button type="button" role="tab" aria-selected={!preview} className={styles.tab} onClick={() => setPreview(false)}>
          Write
        </button>
        <button type="button" role="tab" aria-selected={preview} className={styles.tab} onClick={() => setPreview(true)}>
          Preview
        </button>
      </div>
      {preview ? (
        <div className={styles.preview}>{draft.trim() ? <Markdown>{draft}</Markdown> : <span className={ui.muted}>Nothing to preview.</span>}</div>
      ) : (
        <textarea
          className={styles.textarea}
          aria-label="Description"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={keys}
          rows={Math.max(10, draft.split('\n').length + 2)}
          autoFocus
        />
      )}
      <div className={styles.bodyActions}>
        <span className={ui.muted}>Markdown · Ctrl+Enter to save · Esc to cancel</span>
        <button type="button" className={ui.btn} onClick={cancel} disabled={pending}>
          Cancel
        </button>
        <button type="button" className={ui.primary} onClick={() => save(base)} disabled={pending}>
          Save
        </button>
      </div>
    </section>
  );
}
