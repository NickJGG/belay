'use client';
/**
 * The project page's sort and filter panel. Every control writes straight to the URL and leaves the
 * panel open. The state comes in as props from the server, since `src/query.ts` pulls in node:path.
 */
import { ArrowUpDown, Check, ChevronRight, CircleCheck, CircleDot, Flag, SlidersHorizontal, UserRound, type LucideIcon } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';
import type { IssueSort, SortField } from '../../../../src/query.ts';
import type { Source } from '../../../../src/store.ts';
import { VIEW_PARAMS, VIEW_STATUSES, isDefaultStatuses, toggleStatus, type ViewStatus } from '../../../../src/view.ts';
import styles from './page.module.css';

const SORTS: [SortField, string][] = [
  ['id', 'ID'],
  ['title', 'Title'],
  ['created', 'Created'],
  ['updated', 'Updated'],
];

type Edits = Record<string, string | undefined>;
type Sub = 'sort' | 'status' | 'priority' | 'source' | 'ready';

export function ViewMenu({
  tab,
  statuses,
  priority,
  source,
  readiness,
  sort,
  active,
}: {
  tab: 'issues' | 'ideas';
  statuses: readonly ViewStatus[];
  priority?: 'high';
  source?: Source;
  readiness?: 'ready' | 'blocked';
  sort?: IssueSort;
  /** Anything differs from the default view. */
  active: boolean;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const id = useId();
  const wrap = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const [open, setOpen] = useState(false);
  const [sub, setSub] = useState<Sub>();
  const close = () => {
    setOpen(false);
    setSub(undefined);
  };

  useEffect(() => {
    if (!open) return;
    const onPointer = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) close();
    };
    // On document, so it runs before the key layer's window listener sees the Escape.
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      e.preventDefault();
      const inside = wrap.current?.contains(document.activeElement);
      if (sub) {
        setSub(undefined);
        if (inside) document.getElementById(`${id}-${sub}-trigger`)?.focus();
      } else {
        close();
        if (inside) button.current?.focus();
      }
    };
    document.addEventListener('pointerdown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('pointerdown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [open, sub, id]);

  /** Mouse hover opens a row's list, and moving onto anything else in the panel closes it. */
  const onPanelMove = (e: React.PointerEvent) => {
    // The panel's own padding lies on the path from a row to its list.
    if (e.pointerType !== 'mouse' || e.target === e.currentTarget) return;
    const key = (e.target as Element).closest<HTMLElement>('[data-flyout]')?.dataset.flyout as Sub | undefined;
    if (key !== sub) setSub(key);
  };

  const set = (edits: Edits) => {
    const q = new URLSearchParams(search);
    for (const [k, v] of Object.entries(edits)) {
      if (v) q.set(k, v);
      else q.delete(k);
    }
    router.push(q.size ? `${pathname}?${q}` : pathname, { scroll: false });
  };

  const option = (label: string, checked: boolean, onClick: () => void, role: 'radio' | 'checkbox', disabled = false) => (
    <button key={label} type="button" role={role} aria-checked={checked} className={styles.viewOption} disabled={disabled} onClick={onClick}>
      {label}
      {checked && <Check size={12} className={styles.viewCheck} aria-hidden />}
    </button>
  );
  const changed: Record<Sub, boolean> = {
    sort: !!sort,
    status: !isDefaultStatuses(statuses),
    priority: !!priority,
    source: !!source,
    ready: !!readiness,
  };
  // Opens to the left: the panel sits at the right edge of the content.
  const flyout = (key: Sub, Icon: LucideIcon, name: string, items: React.ReactNode) => (
    <div className={styles.viewField} data-flyout={key}>
      <button
        id={`${id}-${key}-trigger`}
        type="button"
        className={styles.viewTrigger}
        aria-expanded={sub === key}
        aria-controls={sub === key ? `${id}-${key}-list` : undefined}
        onClick={() => setSub(key)}
      >
        <Icon size={12} className={styles.viewIcon} data-on={changed[key] || undefined} aria-hidden />
        {name}
        <ChevronRight size={12} className={styles.viewChevron} aria-hidden />
      </button>
      {sub === key && (
        <div id={`${id}-${key}-list`} role="group" aria-labelledby={`${id}-${key}-trigger`} className={styles.viewFlyout}>
          {items}
        </div>
      )}
    </div>
  );
  const choice = (key: Sub, Icon: LucideIcon, name: string, value: string | undefined, options: [string | undefined, string][]) =>
    flyout(
      key,
      Icon,
      name,
      <div role="radiogroup" aria-label={name}>
        {options.map(([v, l]) => option(l, v === value, () => v !== value && set({ [key]: v }), 'radio'))}
      </div>,
    );

  const label = (s: string) => s[0].toUpperCase() + s.slice(1);

  return (
    <div ref={wrap} className={styles.view}>
      <button
        ref={button}
        type="button"
        className={styles.viewButton}
        data-on={active || open || undefined}
        aria-label="Sort and filter"
        title="Sort and filter"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? `${id}-panel` : undefined}
        onClick={() => (open ? close() : setOpen(true))}
      >
        <SlidersHorizontal size={14} aria-hidden />
      </button>
      {open && (
        <div id={`${id}-panel`} role="dialog" aria-label="Sort and filter" className={styles.viewPanel} onPointerMove={onPanelMove}>
          <div>
            {flyout(
              'sort',
              ArrowUpDown,
              'Sort',
              <>
                <div role="radiogroup" aria-label="Sort by">
                  {SORTS.map(([f, l]) => option(l, sort?.field === f, () => sort?.field !== f && set({ sort: f, dir: undefined }), 'radio'))}
                </div>
                <hr className={styles.viewRule} />
                <div role="radiogroup" aria-label="Direction">
                  {option('Ascending', !!sort && !sort.desc, () => sort?.desc && set({ dir: 'asc' }), 'radio', !sort)}
                  {option('Descending', !!sort?.desc, () => sort && !sort.desc && set({ dir: 'desc' }), 'radio', !sort)}
                </div>
              </>,
            )}
            <hr className={styles.viewRule} />
            {tab === 'issues' &&
              flyout(
                'status',
                CircleDot,
                'Status',
                VIEW_STATUSES.map((s) => {
                  const on = statuses.includes(s);
                  // The last checked status stays checked: an empty list would fall back to the default set.
                  const last = on && statuses.length === 1;
                  return option(label(s), on, () => set({ status: toggleStatus(statuses, s) }), 'checkbox', last);
                }),
              )}
            {choice('priority', Flag, 'Priority', priority, [
              [undefined, 'Any'],
              ['high', 'High'],
            ])}
            {choice('source', UserRound, 'Source', source, [
              [undefined, 'Any'],
              ['user', 'User'],
              ['claude', 'Claude'],
            ])}
            {tab === 'issues' &&
              choice('ready', CircleCheck, 'Readiness', readiness === 'ready' ? '1' : readiness, [
                [undefined, 'Any'],
                ['1', 'Ready'],
                ['blocked', 'Blocked'],
              ])}
          </div>
          {active && (
            <button type="button" className={styles.viewReset} onClick={() => set(Object.fromEntries(VIEW_PARAMS.map((k) => [k, undefined])))}>
              Reset
            </button>
          )}
        </div>
      )}
    </div>
  );
}
