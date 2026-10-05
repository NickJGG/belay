'use client';
/**
 * The keyboard layer: the j/k selection, single-key commands, the ⌘K palette and the cheat sheet.
 * A component showing an issue registers handlers for it, so a key goes through the same optimistic
 * path as a click on that component. With none registered, the action is called directly.
 */
import { createContext, useContext, useEffect, useEffectEvent, useMemo, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { keyCommand, pageProject, pageIssue, step, type KeyCommand } from '../../src/keys.ts';
import type { MoveTarget } from '../../src/sidebar.ts';
import { moveProjectTo, quickAdd, setIssuePriority, setIssueStatus, type Result } from '@/app/actions';
import type { IssueStatus } from '@/lib/types';
import { issueHref } from './bits';
import { Palette, type PaletteData, type PalettePage } from './Palette';
import { Shortcuts } from './Shortcuts';
import { toastError } from './Toaster';

export interface IssueHandlers {
  setStatus?: (s: IssueStatus) => void;
  setHigh?: (high: boolean) => void;
  edit?: () => void;
}

type HandlerRef = { current: IssueHandlers };

interface Api {
  select: (id: string | undefined) => void;
  register: (id: string, h: HandlerRef) => () => void;
  openPalette: (page?: PalettePage) => void;
  openHelp: () => void;
}

const ApiCtx = createContext<Api | null>(null);
const SelectedCtx = createContext<string | undefined>(undefined);

export const useKeys = () => useContext(ApiCtx);

/** Props that make an element a j/k stop for `id`, ringed while selected. */
export function useSelectable(id: string) {
  const api = useContext(ApiCtx);
  const selected = useContext(SelectedCtx) === id;
  const onClick = (e: React.MouseEvent) => {
    // A click that follows a link is navigation, not selection.
    if (!(e.target as Element).closest('a')) api?.select(id);
  };
  return { 'data-issue-id': id, 'data-selected': selected || undefined, onClick };
}

export function useIssueKeys(id: string, handlers: IssueHandlers) {
  const api = useContext(ApiCtx);
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });
  useEffect(() => api?.register(id, ref), [api, id]);
}

const NOT_TEXT = new Set(['checkbox', 'radio', 'button', 'submit', 'reset', 'range', 'color']);

function focusKind(t: EventTarget | null): 'text' | 'control' | 'none' {
  if (!(t instanceof HTMLElement)) return 'none';
  if (t.isContentEditable || t.closest('textarea, select')) return 'text';
  if (t instanceof HTMLInputElement) return NOT_TEXT.has(t.type) ? 'control' : 'text';
  return t.closest('a, button, summary') ? 'control' : 'none';
}

export function KeysProvider({ data, children }: { data: PaletteData; children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const handlers = useRef(new Map<string, Set<HandlerRef>>());
  const [sel, setSel] = useState<{ path: string; id: string }>();
  const [palette, setPalette] = useState<PalettePage>();
  const [help, setHelp] = useState(false);
  const [, start] = useTransition();
  const path = useRef(pathname);
  useEffect(() => {
    path.current = pathname;
  });

  // A selection belongs to the page it was made on.
  const selected = sel?.path === pathname ? sel.id : undefined;
  const target = selected ?? pageIssue(pathname);

  const api = useMemo<Api>(
    () => ({
      select: (id) => setSel(id === undefined ? undefined : { path: path.current, id }),
      register: (id, h) => {
        const map = handlers.current;
        if (!map.has(id)) map.set(id, new Set());
        map.get(id)!.add(h);
        return () => {
          map.get(id)?.delete(h);
          if (!map.get(id)?.size) map.delete(id);
        };
      },
      openPalette: (page = { kind: 'root' }) => setPalette(page),
      openHelp: () => setHelp(true),
    }),
    [],
  );

  const handler = <K extends keyof IssueHandlers>(id: string, k: K): IssueHandlers[K] => {
    for (const h of handlers.current.get(id) ?? []) if (h.current[k]) return h.current[k];
    return undefined;
  };

  const direct = (action: () => Promise<Result>) =>
    start(async () => {
      const r = await action();
      if (r.error) toastError(r.error);
    });

  const act = {
    setStatus: (id: string, s: IssueStatus) => {
      const h = handler(id, 'setStatus');
      if (h) h(s);
      else direct(() => setIssueStatus(id, s));
    },
    setHigh: (id: string, high: boolean) => {
      const h = handler(id, 'setHigh');
      if (h) h(high);
      else direct(() => setIssuePriority(id, high));
    },
    open: (id: string) => {
      if (pageIssue(pathname) !== id) router.push(issueHref(id));
    },
    edit: (id: string) => {
      const h = handler(id, 'edit');
      if (h) h();
      else act.open(id);
    },
    moveProject: (key: string, move: MoveTarget) => direct(() => moveProjectTo(key, null, move)),
    create: async (project: string, title: string, status: IssueStatus) => {
      const r = await quickAdd(project, title, status);
      if (r.error) return toastError(r.error);
      if (pageProject(pathname) === project) api.select(r.id);
      else router.push(issueHref(r.id!));
    },
  };

  /** Returns whether the key was used, so the browser's default for it can be suppressed. */
  const run = (cmd: KeyCommand): boolean => {
    switch (cmd.kind) {
      case 'palette':
        api.openPalette();
        return true;
      case 'create': {
        const project = pageProject(pathname);
        api.openPalette(project ? { kind: 'title', project } : { kind: 'project' });
        return true;
      }
      case 'help':
        setHelp(true);
        return true;
      case 'move': {
        const stops = [...document.querySelectorAll<HTMLElement>('[data-issue-id]')].filter((el) => el.getClientRects().length > 0);
        const id = step([...new Set(stops.map((el) => el.dataset.issueId!))], selected, cmd.delta);
        if (!id) return false;
        api.select(id);
        stops.find((el) => el.dataset.issueId === id)?.scrollIntoView({ block: 'nearest' });
        return true;
      }
      case 'clear':
        if (!selected) return false;
        api.select(undefined);
        return true;
      case 'open':
        if (!selected) return false;
        act.open(selected);
        return true;
    }
    if (!target) return false;
    if (cmd.kind === 'status') act.setStatus(target, cmd.status);
    else act.edit(target);
    return true;
  };

  const onKey = useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented || e.isComposing) return;
    const cmd = keyCommand({ key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, focus: focusKind(e.target) });
    if (!cmd) return;
    // Open dialogs own the keyboard. Ctrl+K is still swallowed there, since browsers bind it to the address bar.
    if (document.querySelector('dialog[open]')) {
      if (cmd.kind === 'palette') e.preventDefault();
      return;
    }
    if (run(cmd)) e.preventDefault();
  });

  useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e);
    window.addEventListener('keydown', listener);
    return () => window.removeEventListener('keydown', listener);
  }, []);

  useEffect(() => {
    const listener = (e: MouseEvent) => {
      if (!(e.target as Element).closest('[data-issue-id], dialog')) api.select(undefined);
    };
    document.addEventListener('click', listener);
    return () => document.removeEventListener('click', listener);
  }, [api]);

  const targetIssue = target ? data.issues.find((t) => t.id === target) : undefined;

  return (
    <ApiCtx value={api}>
      <SelectedCtx value={selected}>
        {children}
        <Palette
          data={data}
          page={palette}
          setPage={setPalette}
          target={targetIssue}
          onTargetPage={target !== undefined && pageIssue(pathname) === target}
          defaultProject={pageProject(pathname)}
          act={{ ...act, help: () => setHelp(true), go: (href: string) => router.push(href) }}
        />
        <Shortcuts open={help} onClose={() => setHelp(false)} />
      </SelectedCtx>
    </ApiCtx>
  );
}
