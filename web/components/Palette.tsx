'use client';
import { useState } from 'react';
import { Command } from 'cmdk';
import { STATUS_KEYS } from '../../src/keys.ts';
import { sectionNeighbours, sidebarSections, type MoveTarget, type SidebarProject } from '../../src/sidebar.ts';
import type { IssueStatus } from '@/lib/types';
import { projectHref } from './bits';
import { Kbd, useModKey } from './Kbd';
import { Modal } from './Modal';
import { StatusIcon } from './StatusIcon';
import styles from './Keys.module.css';

export interface PaletteIssue {
  id: string;
  title: string;
  status: IssueStatus;
  project: string;
  high: boolean;
}

export interface PaletteData {
  projects: SidebarProject[];
  issues: PaletteIssue[];
}

interface Actions {
  setStatus: (id: string, s: IssueStatus) => void;
  setHigh: (id: string, high: boolean) => void;
  open: (id: string) => void;
  newIssue: () => void;
  moveProject: (key: string, move: MoveTarget) => void;
  help: () => void;
  go: (href: string) => void;
}

interface Props {
  data: PaletteData;
  open: boolean;
  onClose: () => void;
  /** The selected issue, or the one whose page this is. */
  target: PaletteIssue | undefined;
  onTargetPage: boolean;
  defaultProject: string | undefined;
  act: Actions;
}

const VIEWS: [string, string][] = [
  ['Home', '/'],
  ['Projects', '/projects'],
  ['Issues', '/issues'],
  ['Ideas', '/issues?status=idea'],
  ['Archived', '/archived'],
  ['Settings', '/settings'],
];

export function Palette(props: Props) {
  return (
    <Modal open={props.open} onClose={props.onClose} label="Command menu" className={styles.palette}>
      <Body {...props} />
    </Modal>
  );
}

function Body({ data, onClose: close, target, onTargetPage, defaultProject, act }: Props) {
  const [search, setSearch] = useState('');
  const mod = useModKey();
  const then = (fn: () => void) => () => {
    close();
    fn();
  };
  const here = defaultProject?.toUpperCase();
  const { prev, next } = here ? sectionNeighbours(sidebarSections(data.projects), here) : {};

  return (
    <Command label="Command menu" loop className={styles.command}>
      <div className={styles.inputRow}>
        <Command.Input autoFocus value={search} onValueChange={setSearch} placeholder="Type a command or search…" className={styles.input} />
        <Kbd>Esc</Kbd>
      </div>
      <Command.List className={styles.list}>
        <Command.Empty className={styles.hint}>No results.</Command.Empty>
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
              <Command.Item value="open issue" onSelect={then(() => act.open(target.id))} className={styles.item}>
                <span className={styles.icon} />
                <span className={styles.grow}>Open issue</span>
                <Kbd>E</Kbd>
              </Command.Item>
            )}
          </Command.Group>
        )}
        <Command.Group heading="Actions" className={styles.group}>
          <Command.Item value="new issue create" onSelect={then(act.newIssue)} className={styles.item}>
            <span className={styles.icon}>+</span>
            <span className={styles.grow}>New issue…</span>
            <Kbd>C</Kbd>
          </Command.Item>
          {here && prev && (
            <Command.Item value="move project up" onSelect={then(() => act.moveProject(here, { before: prev }))} className={styles.item}>
              <span className={styles.icon}>↑</span>
              <span className={styles.grow}>Move project up</span>
            </Command.Item>
          )}
          {here && next && (
            <Command.Item value="move project down" onSelect={then(() => act.moveProject(here, { after: next }))} className={styles.item}>
              <span className={styles.icon}>↓</span>
              <span className={styles.grow}>Move project down</span>
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
        {/* Hundreds of issues would bury everything else, so they appear only once there's a query. */}
        {search.trim() && (
          <Command.Group heading="Issues" className={styles.group}>
            {data.issues.map((t) => (
              <Command.Item key={t.id} value={`${t.id} ${t.title}`} onSelect={then(() => act.open(t.id))} className={styles.item}>
                <StatusIcon status={t.status} />
                <span className={styles.id}>{t.id}</span>
                <span className={styles.grow}>{t.title}</span>
              </Command.Item>
            ))}
          </Command.Group>
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
        <span className={styles.footEnd}>
          <Kbd>{mod}</Kbd>
          <Kbd>K</Kbd> palette
        </span>
      </div>
    </Command>
  );
}
