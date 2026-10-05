'use client';
import { useEffect, useEffectEvent, useState, useTransition } from 'react';
import { keyCommand } from '../../../../../src/keys.ts';
import { editLogEntry } from '@/app/actions';
import { focusKind } from '@/components/Keys';
import { Markdown } from '@/components/Markdown';
import { MarkdownField } from '@/components/MarkdownField';
import { toastError } from '@/components/Toaster';
import ui from '@/components/ui.module.css';
import styles from '../../../i/[id]/issue.module.css';

/** `BodyEditor` without its conflict mode: the action's `at` check refuses a save to an address that now holds another entry. */
export function LogTextEditor({ address, at, text }: { address: string; at: string; text: string }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [pending, start] = useTransition();
  const dirty = editing && draft !== text;

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const edit = () => {
    setDraft(text);
    setEditing(true);
  };

  // The key layer's E edits the page's issue, and a log page has none.
  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (editing || e.defaultPrevented || e.isComposing || document.querySelector('dialog[open]')) return;
    if (keyCommand({ key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, focus: focusKind(e.target) })?.kind !== 'edit') return;
    e.preventDefault();
    edit();
  });
  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  const cancel = () => {
    if (dirty && !window.confirm('Discard your draft?')) return;
    setEditing(false);
  };

  const save = () =>
    start(async () => {
      const r = await editLogEntry(address, at, { text: draft });
      if (r.error) toastError(r.error);
      else setEditing(false);
    });

  const keys = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) save();
    if (e.key === 'Escape') cancel();
  };

  if (!editing) {
    return (
      <section className={styles.body}>
        <Markdown>{text}</Markdown>
        <div className={styles.bodyActions}>
          <button type="button" className={ui.btn} title="Edit (E)" onClick={edit}>
            Edit
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className={styles.body}>
      <MarkdownField value={draft} onChange={setDraft} onKeyDown={keys} minRows={6} label="Text" autoFocus />
      <div className={styles.bodyActions}>
        <span className={ui.muted}>Markdown · first line shows in the log · Ctrl+Enter to save · Esc to cancel</span>
        <button type="button" className={ui.btn} onClick={cancel} disabled={pending}>
          Cancel
        </button>
        <button type="button" className={ui.primary} onClick={save} disabled={pending || !draft.trim()}>
          Save
        </button>
      </div>
    </section>
  );
}
