'use client';
import { useState } from 'react';
import { Command } from 'cmdk';
import { STATUS_KEYS } from '../../src/keys.ts';
import type { ProjectStatus, TaskStatus } from '@/lib/types';
import { projectHref } from './bits';
import { Kbd, useModKey } from './Kbd';
import { Modal } from './Modal';
import { StatusIcon } from './StatusIcon';
import styles from './Keys.module.css';

export interface PaletteTask {
  id: string;
  title: string;
  status: TaskStatus;
  project: string;
  high: boolean;
}

export interface PaletteData {
  projects: { key: string; name: string; status: ProjectStatus }[];
  tasks: PaletteTask[];
}

/** `project` picks where a new task goes; `title` names it. */
export type PalettePage = { kind: 'root' } | { kind: 'project' } | { kind: 'title'; project: string };

interface Actions {
  setStatus: (id: string, s: TaskStatus) => void;
  setHigh: (id: string, high: boolean) => void;
  open: (id: string) => void;
  create: (project: string, title: string, status: TaskStatus) => Promise<void>;
  help: () => void;
  go: (href: string) => void;
}

interface Props {
  data: PaletteData;
  page: PalettePage | undefined;
  setPage: (p: PalettePage | undefined) => void;
  /** The selected task, or the one whose page this is. */
  target: PaletteTask | undefined;
  onTargetPage: boolean;
  defaultProject: string | undefined;
  act: Actions;
}

const VIEWS: [string, string][] = [
  ['Next', '/'],
  ['All issues', '/issues'],
  ['Ideas', '/issues?status=idea'],
  ['Archived', '/archived'],
  ['Settings', '/settings'],
];

export function Palette(props: Props) {
  const { page, setPage } = props;
  return (
    <Modal open={page !== undefined} onClose={() => setPage(undefined)} label="Command menu" className={styles.palette}>
      {page && <Body key={page.kind === 'title' ? `title:${page.project}` : page.kind} {...props} page={page} />}
    </Modal>
  );
}

function Body({ data, page, setPage, target, onTargetPage, defaultProject, act }: Props & { page: PalettePage }) {
  const [search, setSearch] = useState('');
  const mod = useModKey();
  const close = () => setPage(undefined);
  const then = (fn: () => void) => () => {
    close();
    fn();
  };
  const project = page.kind === 'title' ? data.projects.find((p) => p.key === page.project) : undefined;

  const placeholder = { root: 'Type a command or search…', project: 'Create a task in which project?', title: `New task in ${project?.name ?? ''}` }[page.kind];

  const back = (e: React.KeyboardEvent) => {
    if (e.key !== 'Backspace' || search || page.kind === 'root') return;
    e.preventDefault();
    setPage(page.kind === 'title' ? { kind: 'project' } : { kind: 'root' });
  };

  return (
    <Command label="Command menu" loop shouldFilter={page.kind !== 'title'} className={styles.command}>
      <div className={styles.inputRow}>
        {page.kind !== 'root' && <span className={styles.crumb}>{page.kind === 'title' ? `Create · ${page.project}` : 'Create'}</span>}
        <Command.Input autoFocus value={search} onValueChange={setSearch} onKeyDown={back} placeholder={placeholder} className={styles.input} />
        <Kbd>Esc</Kbd>
      </div>
      <Command.List className={styles.list}>
        {page.kind === 'title' ? (
          search.trim() ? (
            (['idea', 'todo'] as const).map((s) => (
              <Command.Item key={s} value={s} onSelect={then(() => void act.create(page.project, search.trim(), s))} className={styles.item}>
                <StatusIcon status={s} />
                <span className={styles.grow}>
                  Create {s} <q>{search.trim()}</q>
                </span>
              </Command.Item>
            ))
          ) : (
            <div className={styles.hint}>Type a title. Enter creates it as an idea; ↓ Enter as a todo.</div>
          )
        ) : (
          <Command.Empty className={styles.hint}>No results.</Command.Empty>
        )}

        {page.kind === 'project' &&
          data.projects
            .filter((p) => p.status !== 'archived')
            .map((p) => (
              <Command.Item key={p.key} value={`${p.key} ${p.name}`} onSelect={() => setPage({ kind: 'title', project: p.key })} className={styles.item}>
                <span className={styles.grow}>{p.name}</span>
                <span className={styles.meta}>{p.key}</span>
              </Command.Item>
            ))}

        {page.kind === 'root' && (
          <>
            {target && (
              <Command.Group heading={`${target.id} · ${target.title}`} className={styles.group}>
                {STATUS_KEYS.filter((s) => s !== target.status).map((s) => (
                  <Command.Item key={s} value={`status ${s}`} onSelect={then(() => act.setStatus(target.id, s))} className={styles.item}>
                    <StatusIcon status={s} />
                    <span className={styles.grow}>Set status: {s}</span>
                    <Kbd>{STATUS_KEYS.indexOf(s) + 1}</Kbd>
                  </Command.Item>
                ))}
                <Command.Item value="priority" onSelect={then(() => act.setHigh(target.id, !target.high))} className={styles.item}>
                  <span className={styles.bang}>!!</span>
                  <span className={styles.grow}>{target.high ? 'Remove high priority' : 'Set high priority'}</span>
                </Command.Item>
                {!onTargetPage && (
                  <Command.Item value="open task" onSelect={then(() => act.open(target.id))} className={styles.item}>
                    <span className={styles.icon} />
                    <span className={styles.grow}>Open task</span>
                    <Kbd>E</Kbd>
                  </Command.Item>
                )}
              </Command.Group>
            )}
            <Command.Group heading="Actions" className={styles.group}>
              <Command.Item
                value="create task new"
                onSelect={() => setPage(defaultProject ? { kind: 'title', project: defaultProject } : { kind: 'project' })}
                className={styles.item}
              >
                <span className={styles.icon}>+</span>
                <span className={styles.grow}>Create task{defaultProject ? ` in ${defaultProject}` : '…'}</span>
                <Kbd>C</Kbd>
              </Command.Item>
              {defaultProject && (
                <Command.Item value="create task in another project" onSelect={() => setPage({ kind: 'project' })} className={styles.item}>
                  <span className={styles.icon}>+</span>
                  <span className={styles.grow}>Create task in another project…</span>
                </Command.Item>
              )}
              <Command.Item value="keyboard shortcuts help" onSelect={then(act.help)} className={styles.item}>
                <span className={styles.icon}>?</span>
                <span className={styles.grow}>Keyboard shortcuts</span>
                <Kbd>?</Kbd>
              </Command.Item>
            </Command.Group>
            <Command.Group heading="Go to" className={styles.group}>
              {VIEWS.map(([label, href]) => (
                <Command.Item key={href} value={`go ${label}`} onSelect={then(() => act.go(href))} className={styles.item}>
                  <span className={styles.icon}>→</span>
                  <span className={styles.grow}>{label}</span>
                </Command.Item>
              ))}
            </Command.Group>
            <Command.Group heading="Projects" className={styles.group}>
              {data.projects.map((p) => (
                <Command.Item key={p.key} value={`project ${p.key} ${p.name}`} onSelect={then(() => act.go(projectHref(p.key)))} className={styles.item}>
                  <span className={styles.icon}>#</span>
                  <span className={styles.grow}>{p.name}</span>
                  <span className={styles.meta}>{p.status === 'active' ? p.key : `${p.key} · ${p.status}`}</span>
                </Command.Item>
              ))}
            </Command.Group>
            {/* Hundreds of tasks would bury everything else, so they appear only once there's a query. */}
            {search.trim() && (
              <Command.Group heading="Tasks" className={styles.group}>
                {data.tasks.map((t) => (
                  <Command.Item key={t.id} value={`${t.id} ${t.title}`} onSelect={then(() => act.open(t.id))} className={styles.item}>
                    <StatusIcon status={t.status} />
                    <span className={styles.id}>{t.id}</span>
                    <span className={styles.grow}>{t.title}</span>
                  </Command.Item>
                ))}
              </Command.Group>
            )}
          </>
        )}
      </Command.List>
      <div className={styles.foot}>
        <span>
          <Kbd>↑</Kbd>
          <Kbd>↓</Kbd> move
        </span>
        <span>
          <Kbd>↵</Kbd> run
        </span>
        {page.kind !== 'root' && (
          <span>
            <Kbd>⌫</Kbd> back
          </span>
        )}
        <span className={styles.footEnd}>
          <Kbd>{mod}</Kbd>
          <Kbd>K</Kbd> palette
        </span>
      </div>
    </Command>
  );
}
