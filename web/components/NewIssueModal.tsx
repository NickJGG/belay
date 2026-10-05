'use client';
import { useState, useTransition } from 'react';
import { createIssue } from '@/app/actions';
import type { Ref } from './Chip';
import { Dropdown } from './Dropdown';
import { IssuePicker } from './IssuePicker';
import { Kbd, useModKey } from './Kbd';
import { MarkdownField } from './MarkdownField';
import { Modal } from './Modal';
import type { PaletteData } from './Palette';
import { StatusIcon } from './StatusIcon';
import ui from './ui.module.css';
import styles from './NewIssueModal.module.css';

export interface Draft {
  title: string;
  status: 'idea' | 'todo';
  high: boolean;
  project: string;
  blockers: string[];
  body: string;
}

export const EMPTY_DRAFT: Draft = { title: '', status: 'idea', high: false, project: '', blockers: [], body: '' };

/** Nothing typed or chosen yet, so opening may re-target the project to the current page's. */
export const isBlank = (d: Draft) => !d.title && !d.body && !d.blockers.length && !d.high && d.status === 'idea';

const STATUS_OPTIONS: [Draft['status'], string][] = [
  ['idea', 'Idea'],
  ['todo', 'Todo'],
];

/** The draft lives with the caller: `Modal` unmounts its children, and closing only hides the draft. */
export function NewIssueModal({
  open,
  onClose,
  draft,
  setDraft,
  data,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  draft: Draft;
  setDraft: (d: Draft) => void;
  data: PaletteData;
  onCreated: (id: string, project: string) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} label="New issue" className={styles.dialog}>
      <Form draft={draft} setDraft={setDraft} data={data} onClose={onClose} onCreated={onCreated} />
    </Modal>
  );
}

function Form({
  draft,
  setDraft,
  data,
  onClose,
  onCreated,
}: {
  draft: Draft;
  setDraft: (d: Draft) => void;
  data: PaletteData;
  onClose: () => void;
  onCreated: (id: string, project: string) => void;
}) {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const mod = useModKey();
  const set = (patch: Partial<Draft>) => {
    setError(undefined);
    setDraft({ ...draft, ...patch });
  };

  const byId = new Map(data.issues.map((t) => [t.id, t]));
  const blockers = draft.blockers.map((id): Ref => byId.get(id) ?? { id });
  const candidates = data.issues.filter((t) => t.status === 'idea' || t.status === 'todo' || t.status === 'doing');
  const projects = data.projects.filter((p) => p.status !== 'archived').map((p): [string, string] => [p.key, p.name]);

  const submit = () => {
    if (pending) return;
    if (!draft.project) return setError('Pick a project');
    if (!draft.title.trim()) return setError('Give it a title');
    start(async () => {
      const r = await createIssue(draft);
      if (r.error) return setError(r.error);
      setDraft(EMPTY_DRAFT);
      onCreated(r.id!, draft.project);
    });
  };

  const discard = () => {
    setDraft(EMPTY_DRAFT);
    onClose();
  };

  return (
    <div
      className={styles.form}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          submit();
        }
      }}
    >
      <h2 className={styles.heading}>New issue</h2>
      <input
        className={styles.title}
        aria-label="Title"
        placeholder="Issue title"
        autoComplete="off"
        autoFocus
        value={draft.title}
        onChange={(e) => set({ title: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className={styles.props}>
        <span className={styles.prop}>
          <StatusIcon status={draft.status} size={12} />
          <Dropdown label="Status" value={draft.status} options={STATUS_OPTIONS} onChange={(s) => set({ status: s as Draft['status'] })} className={styles.bare} />
        </span>
        <button
          type="button"
          className={styles.prop}
          aria-pressed={draft.high}
          title="Toggle high priority"
          onClick={() => set({ high: !draft.high })}
        >
          <span className={draft.high ? ui.high : ui.muted} aria-hidden>
            !!
          </span>
          {draft.high ? 'High' : 'No priority'}
        </button>
        <Dropdown
          label="Project"
          value={draft.project}
          options={projects}
          placeholder="Project"
          onChange={(project) => set({ project })}
          className={styles.prop}
        />
      </div>
      <div className={styles.blockers}>
        <span className={styles.label}>Blocked by</span>
        <IssuePicker
          label="Blocked by"
          value={blockers}
          onChange={(ids) => set({ blockers: ids })}
          candidates={candidates}
          preferProject={draft.project}
          link={false}
        />
      </div>
      <MarkdownField value={draft.body} onChange={(body) => set({ body })} minRows={6} placeholder="Add a description…" />
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <span className={styles.hint}>
          <Kbd>{mod}</Kbd>
          <Kbd>↵</Kbd> create · <Kbd>Esc</Kbd> keep as draft
        </span>
        <button type="button" className={ui.btn} onClick={discard} disabled={pending}>
          Discard
        </button>
        <button type="button" className={ui.primary} onClick={submit} disabled={pending}>
          Create issue
        </button>
      </div>
    </div>
  );
}
