'use client';
import { useEffect, useState, useTransition } from 'react';
import { Pencil, Trash2 } from 'lucide-react';
import { ago } from '../../../../src/time.ts';
import { addIssueComment, deleteIssueComment, editIssueComment } from '@/app/actions';
import { Markdown } from '@/components/Markdown';
import { MarkdownField } from '@/components/MarkdownField';
import { toastError } from '@/components/Toaster';
import ui from '@/components/ui.module.css';
import type { Comment } from '@/lib/types';
import styles from './issue.module.css';

/** `n` and `at` identify the comment as loaded; the ops refuse an edit or delete if live sync has since moved `#n`. */
interface Target {
  n: number;
  at: string;
}

const isSubmit = (e: React.KeyboardEvent) => e.key === 'Enter' && (e.ctrlKey || e.metaKey);

export function Comments({ id, comments }: { id: string; comments: Comment[] }) {
  const [draft, setDraft] = useState('');
  const [editing, setEditing] = useState<Target & { original: string; text: string }>();
  const [deleting, setDeleting] = useState<Target>();
  const [pending, start] = useTransition();
  const dirty = draft.trim() !== '' || (editing !== undefined && editing.text !== editing.original);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const post = () => {
    if (!draft.trim()) return;
    start(async () => {
      const r = await addIssueComment(id, draft);
      if (r.error) toastError(r.error);
      else setDraft('');
    });
  };

  const save = () =>
    start(async () => {
      if (!editing) return;
      const r = await editIssueComment(id, editing.n, editing.at, editing.text);
      if (r.error) toastError(r.error);
      else setEditing(undefined);
    });

  const cancelEdit = () => {
    if (editing && editing.text !== editing.original && !window.confirm('Discard your edit?')) return;
    setEditing(undefined);
  };

  const remove = (t: Target) =>
    start(async () => {
      const r = await deleteIssueComment(id, t.n, t.at);
      if (r.error) toastError(r.error);
      setDeleting(undefined);
    });

  return (
    <section className={styles.thread} aria-labelledby="comments-title">
      <h2 id="comments-title" className={ui.h2}>
        Comments
      </h2>
      {comments.length > 0 && (
        <ol className={styles.comments}>
          {comments.map((c, i) => {
            const n = i + 1;
            const isEditing = editing?.n === n;
            const isDeleting = deleting?.n === n;
            return (
              <li key={`${n}-${c.at}`} className={styles.comment}>
                <div className={styles.commentHead}>
                  <span className={styles.author}>{c.by === 'claude' ? 'Claude' : 'You'}</span>
                  {/* Relative to the clock at render, so the server's and the browser's can straddle a minute. */}
                  <time className={ui.muted} dateTime={c.at} title={c.at.replace('T', ' ')} suppressHydrationWarning>
                    {ago(c.at)}
                  </time>
                  {isDeleting ? (
                    <span className={styles.confirmDelete}>
                      Delete?
                      <button type="button" className={ui.link} onClick={() => remove(deleting)} disabled={pending}>
                        Yes
                      </button>
                      <button type="button" className={ui.link} onClick={() => setDeleting(undefined)} disabled={pending} autoFocus>
                        No
                      </button>
                    </span>
                  ) : (
                    !isEditing && (
                      <span className={styles.commentActions}>
                        <button
                          type="button"
                          className={ui.icon}
                          title="Edit"
                          aria-label={`Edit comment ${n}`}
                          onClick={() => setEditing({ n, at: c.at, original: c.text, text: c.text })}
                        >
                          <Pencil size={13} aria-hidden />
                        </button>
                        <button
                          type="button"
                          className={ui.icon}
                          title="Delete"
                          aria-label={`Delete comment ${n}`}
                          onClick={() => setDeleting({ n, at: c.at })}
                        >
                          <Trash2 size={13} aria-hidden />
                        </button>
                      </span>
                    )
                  )}
                </div>
                {isEditing ? (
                  <div className={styles.body}>
                    <MarkdownField
                      label="Comment"
                      value={editing.text}
                      onChange={(text) => setEditing({ ...editing, text })}
                      onKeyDown={(e) => {
                        if (isSubmit(e)) save();
                        if (e.key === 'Escape') cancelEdit();
                      }}
                      minRows={3}
                      autoFocus
                    />
                    <div className={styles.bodyActions}>
                      <span className={ui.muted}>Ctrl+Enter to save · Esc to cancel</span>
                      <button type="button" className={ui.btn} onClick={cancelEdit} disabled={pending}>
                        Cancel
                      </button>
                      <button type="button" className={ui.primary} onClick={save} disabled={pending || !editing.text.trim()}>
                        Save
                      </button>
                    </div>
                  </div>
                ) : (
                  <Markdown>{c.text}</Markdown>
                )}
              </li>
            );
          })}
        </ol>
      )}
      <div className={styles.body}>
        <MarkdownField
          label="New comment"
          placeholder="Leave a comment…"
          value={draft}
          onChange={setDraft}
          onKeyDown={(e) => {
            if (isSubmit(e)) post();
          }}
          minRows={3}
        />
        <div className={styles.bodyActions}>
          <span className={ui.muted}>Markdown · Ctrl+Enter to post</span>
          <button type="button" className={ui.primary} onClick={post} disabled={pending || !draft.trim()}>
            Comment
          </button>
        </div>
      </div>
    </section>
  );
}
