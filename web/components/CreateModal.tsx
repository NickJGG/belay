'use client';
import { useEffect, useRef, useState, useTransition } from 'react';
import { CREATE_TYPES, EMPTY_CREATE, cycleType, switchKeyDelta, type CreateDraft, type CreateType } from '../../src/create.ts';
import { createIssue, createLog } from '@/app/actions';
import type { Ref } from './Chip';
import { Dropdown, type Option } from './Dropdown';
import { IssuePicker } from './IssuePicker';
import { Kbd, useModKey } from './Kbd';
import { MarkdownField } from './MarkdownField';
import { Modal } from './Modal';
import type { PaletteData } from './Palette';
import ui from './ui.module.css';
import styles from './CreateModal.module.css';

// The key predates issues sharing it, so a project and kind remembered from logging carry over.
const LAST_KEY = 'tracker:last-log';

/** The project of the last issue or log created here, and the last log's kind, which the next draft starts from. */
export function lastCreated(): { project?: string; kind?: string } {
  try {
    return JSON.parse(localStorage.getItem(LAST_KEY) ?? '{}');
  } catch {
    return {};
  }
}

function rememberLast(project: string, kind: string | undefined) {
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

const TYPE_LABELS: Record<CreateType, string> = { todo: 'Todo', idea: 'Idea', log: 'Log' };
const SUBMIT_LABELS: Record<CreateType, string> = { todo: 'Create todo', idea: 'Create idea', log: 'Log' };

const swallowEnter = (e: React.KeyboardEvent) => {
  if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) e.preventDefault();
};

/** The draft lives with the caller: `Modal` unmounts its children, and closing only hides the draft. */
export function CreateModal({
  open,
  onClose,
  draft,
  setDraft,
  data,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  draft: CreateDraft;
  setDraft: (d: CreateDraft) => void;
  data: PaletteData;
  onCreated: (id: string, project: string) => void;
}) {
  return (
    <Modal open={open} onClose={onClose} label="Create" className={styles.dialog}>
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
  draft: CreateDraft;
  setDraft: (d: CreateDraft) => void;
  data: PaletteData;
  onClose: () => void;
  onCreated: (id: string, project: string) => void;
}) {
  const [error, setError] = useState<string>();
  const [pending, start] = useTransition();
  const mod = useModKey();
  const form = useRef<HTMLDivElement>(null);
  const text = useRef<HTMLInputElement>(null);
  const set = (patch: Partial<CreateDraft>) => {
    setError(undefined);
    setDraft({ ...draft, ...patch });
  };
  const isLog = draft.type === 'log';

  // Switching away from the focused field's type unmounts it, which would drop focus to the page.
  useEffect(() => {
    if (!form.current?.contains(document.activeElement)) text.current?.focus();
  }, [draft.type]);

  const projects = data.projects.filter((p) => p.status !== 'archived');
  const kinds = projects.find((p) => p.key === draft.project)?.kinds ?? [];
  const byId = new Map(data.issues.map((t) => [t.id, t]));
  const blockers = draft.blockers.map((id): Ref => byId.get(id) ?? { id });
  const candidates = data.issues.filter((t) => t.status === 'idea' || t.status === 'todo' || t.status === 'doing');

  const submit = () => {
    if (pending) return;
    if (!draft.project) return setError('Pick a project');
    if (!draft.text.trim()) return setError(isLog ? 'Say what you did' : 'Give it a title');
    const { type, project, text, kind } = draft;
    start(async () => {
      if (type === 'log') {
        const count = draft.count.trim() ? Number(draft.count) : undefined;
        const r = await createLog({ project, text, kind, count, day: draft.day });
        if (r.error) return setError(r.error);
        rememberLast(project, kind);
        setDraft(EMPTY_CREATE);
        onClose();
      } else {
        const r = await createIssue({ project, title: text, status: type, high: draft.high, blockers: draft.blockers, body: draft.body });
        if (r.error) return setError(r.error);
        rememberLast(project, lastCreated().kind);
        setDraft(EMPTY_CREATE);
        onCreated(r.id!, project);
      }
    });
  };

  const discard = () => {
    setDraft(EMPTY_CREATE);
    onClose();
  };

  return (
    <div
      ref={form}
      className={styles.form}
      onKeyDown={(e) => {
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          submit();
          return;
        }
        const delta = switchKeyDelta({ code: e.code, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey });
        if (delta) {
          e.preventDefault();
          set({ type: cycleType(draft.type, delta) });
        }
      }}
    >
      <Switcher value={draft.type} onChange={(type) => set({ type })} />
      <input
        ref={text}
        className={styles.title}
        aria-label={isLog ? 'What you did' : 'Title'}
        placeholder={isLog ? 'What did you do?' : 'Issue title'}
        autoComplete="off"
        data-autofocus
        value={draft.text}
        onChange={(e) => set({ text: e.target.value })}
        onKeyDown={swallowEnter}
      />
      <div className={styles.props}>
        <Dropdown
          label="Project"
          value={draft.project}
          options={projects.map((p): Option => [p.key, p.name])}
          placeholder="Project"
          onChange={(project) => set({ project, kind: '', count: '' })}
          className={styles.prop}
        />
        {isLog ? (
          <Dropdown label="Day" value={draft.day} options={dayOptions(data.day)} onChange={(day) => set({ day })} className={styles.prop} />
        ) : (
          <button type="button" className={styles.prop} aria-pressed={draft.high} title="Toggle high priority" onClick={() => set({ high: !draft.high })}>
            <span className={draft.high ? ui.high : ui.muted} aria-hidden>
              !!
            </span>
            {draft.high ? 'High' : 'No priority'}
          </button>
        )}
      </div>
      {isLog ? (
        kinds.length > 0 && (
          <div className={styles.kinds} role="group" aria-label="Kind">
            {kinds.map((k) => (
              <button
                key={k}
                type="button"
                className={styles.chip}
                aria-pressed={draft.kind === k}
                onClick={() => set(draft.kind === k ? { kind: '', count: '' } : { kind: k })}
              >
                {k}
              </button>
            ))}
            {draft.kind && (
              <label className={styles.count}>
                <span className={styles.label}>×</span>
                <input
                  className={ui.input}
                  type="number"
                  min={1}
                  aria-label="Count"
                  placeholder="1"
                  value={draft.count}
                  onChange={(e) => set({ count: e.target.value })}
                  onKeyDown={swallowEnter}
                />
              </label>
            )}
          </div>
        )
      ) : (
        <>
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
        </>
      )}
      {error && (
        <p className={styles.error} role="alert">
          {error}
        </p>
      )}
      <div className={styles.actions}>
        <span className={styles.hint}>
          <Kbd>{mod}</Kbd>
          <Kbd>↵</Kbd> {isLog ? 'log' : 'create'} · <Kbd>Ctrl</Kbd>
          <Kbd>[</Kbd>
          <Kbd>]</Kbd> switch · <Kbd>Esc</Kbd> keep as draft
        </span>
        <button type="button" className={ui.btn} onClick={discard} disabled={pending}>
          Discard
        </button>
        <button type="button" className={ui.primary} onClick={submit} disabled={pending}>
          {SUBMIT_LABELS[draft.type]}
        </button>
      </div>
    </div>
  );
}

/** A radio group: one tab stop, arrows move the choice. */
function Switcher({ value, onChange }: { value: CreateType; onChange: (t: CreateType) => void }) {
  const group = useRef<HTMLDivElement>(null);
  const choose = (t: CreateType) => {
    onChange(t);
    group.current?.querySelector<HTMLElement>(`[data-type="${t}"]`)?.focus();
  };
  return (
    <div
      ref={group}
      className={styles.switcher}
      role="radiogroup"
      aria-label="Type"
      onKeyDown={(e) => {
        const delta = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[e.key] as 1 | -1 | undefined;
        if (!delta || e.ctrlKey || e.metaKey || e.altKey) return;
        e.preventDefault();
        choose(cycleType(value, delta));
      }}
    >
      {CREATE_TYPES.map((t) => (
        <button
          key={t}
          type="button"
          role="radio"
          data-type={t}
          aria-checked={value === t}
          tabIndex={value === t ? 0 : -1}
          className={styles.chip}
          onClick={() => choose(t)}
        >
          {TYPE_LABELS[t]}
        </button>
      ))}
    </div>
  );
}
