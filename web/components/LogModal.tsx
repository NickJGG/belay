'use client';
import { useState, useTransition } from 'react';
import { createLog } from '@/app/actions';
import { Dropdown, type Option } from './Dropdown';
import { Kbd } from './Kbd';
import { Modal } from './Modal';
import type { PaletteData } from './Palette';
import ui from './ui.module.css';
import shared from './NewIssueModal.module.css';
import styles from './LogModal.module.css';

export interface LogDraft {
  project: string;
  kind: string;
  count: string;
  text: string;
  /** `today`, `yesterday` or `YYYY-MM-DD`. */
  day: string;
}

export const EMPTY_LOG: LogDraft = { project: '', kind: '', count: '', text: '', day: 'today' };

/** Nothing typed yet, so opening may re-target the project. The kind doesn't count: it's a remembered default. */
export const isBlankLog = (d: LogDraft) => !d.text && !d.count && d.day === 'today';

const LAST_KEY = 'tracker:last-log';

/** The project and kind of the last entry logged here, which the next one starts from. */
export function lastLog(): { project?: string; kind?: string } {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function rememberLog(project: string, kind: string) {
  try {
    localStorage.setItem(LAST_KEY, JSON.stringify({ project, kind }));
  } catch {}
}

/** Today back to the oldest day `addLog` accepts, labelled; `day` is the server's current work day. */
function dayOptions(day: string): Option[] {
  const [y, m, d] = day.split('-').map(Number);
  return Array.from({ length: 8 }, (_, n): Option => {
    if (n === 0) return ['today', 'Today'];
    if (n === 1) return ['yesterday', 'Yesterday'];
    const t = new Date(y, m - 1, d - n);
    const value = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    return [value, t.toLocaleDateString('en', { weekday: 'short', month: 'short', day: 'numeric' })];
  });
}

/** The draft lives with the caller, like `NewIssueModal`'s. */
export function LogModal({
  open,
  onClose,
  draft,
  setDraft,
  data,
}: {
  open: boolean;
  onClose: () => void;
  draft: LogDraft;
  setDraft: (d: LogDraft) => void;
  data: PaletteData;
}) {
  return (
    <Modal open={open} onClose={onClose} label="Log work" className={shared.dialog}>
      <Form draft={draft} setDraft={setDraft} data={data} onClose={onClose} />
    </Modal>
  );
}

function Form({ draft, setDraft, data, onClose }: { draft: LogDraft; setDraft: (d: LogDraft) => void; data: PaletteData; onClose: () => void }) {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const set = (patch: Partial<LogDraft>) => {
    setError(undefined);
    setDraft({ ...draft, ...patch });
  };

  const projects = data.projects.filter((p) => p.status !== 'archived');
  const kinds = projects.find((p) => p.key === draft.project)?.kinds ?? [];

  const submit = () => {
    if (pending) return;
    if (!draft.project) return setError('Pick a project');
    if (!draft.text.trim()) return setError('Say what you did');
    const count = draft.count.trim() ? Number(draft.count) : undefined;
    start(async () => {
      const r = await createLog({ project: draft.project, text: draft.text, kind: draft.kind, count, day: draft.day });
      if (r.error) return setError(r.error);
      rememberLog(draft.project, draft.kind);
      setDraft({ ...EMPTY_LOG, project: draft.project, kind: draft.kind });
      onClose();
    });
  };

  const discard = () => {
    setDraft({ ...EMPTY_LOG, project: draft.project });
    onClose();
  };

  return (
    <div className={shared.form}>
      <h2 className={shared.heading}>Log work</h2>
      <input
        className={shared.title}
        aria-label="What you did"
        placeholder="What did you do?"
        autoComplete="off"
        autoFocus
        value={draft.text}
        onChange={(e) => set({ text: e.target.value })}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            submit();
          }
        }}
      />
      <div className={shared.props}>
        <Dropdown
          label="Project"
          value={draft.project}
          options={projects.map((p): Option => [p.key, p.name])}
          placeholder="Project"
          onChange={(project) => set({ project, kind: '', count: '' })}
          className={shared.prop}
        />
        <Dropdown label="Day" value={draft.day} options={dayOptions(data.day)} onChange={(day) => set({ day })} className={shared.prop} />
      </div>
      {kinds.length > 0 && (
        <div className={styles.kinds} role="group" aria-label="Kind">
          {kinds.map((k) => (
            <button
              key={k}
              type="button"
              className={styles.kind}
              aria-pressed={draft.kind === k}
              onClick={() => set(draft.kind === k ? { kind: '', count: '' } : { kind: k })}
            >
              {k}
            </button>
          ))}
          {draft.kind && (
            <label className={styles.count}>
              <span className={shared.label}>×</span>
              <input
                className={ui.input}
                type="number"
                min={1}
                aria-label="Count"
                placeholder="1"
                value={draft.count}
                onChange={(e) => set({ count: e.target.value })}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    submit();
                  }
                }}
              />
            </label>
          )}
        </div>
      )}
      {error && (
        <p className={shared.error} role="alert">
          {error}
        </p>
      )}
      <div className={shared.actions}>
        <span className={shared.hint}>
          <Kbd>↵</Kbd> log · <Kbd>Esc</Kbd> keep as draft
        </span>
        <button type="button" className={ui.btn} onClick={discard} disabled={pending}>
          Discard
        </button>
        <button type="button" className={ui.primary} onClick={submit} disabled={pending}>
          Log
        </button>
      </div>
    </div>
  );
}
