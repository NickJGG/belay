'use client';
/** The sidebar's project sections, reorderable by dragging, including across sections (which edits focus/group). */
import { useOptimistic, useState, useTransition } from 'react';
import { applyDrop, dropPlan, sidebarSections, type Section, type SectionId, type SidebarProject } from '../../src/sidebar.ts';
import { moveProjectTo } from '@/app/actions';
import { NavLink } from './NavLink';
import { projectHref } from './bits';
import { toastError } from './Toaster';
import styles from './Sidebar.module.css';

/** Where the dragged row would land: before `before`, or at the end of the section when null. */
interface Slot {
  section: SectionId;
  before: string | null;
}

function slotBefore(e: React.DragEvent<HTMLElement>): string | null {
  for (const row of e.currentTarget.querySelectorAll<HTMLElement>('[data-key]')) {
    const r = row.getBoundingClientRect();
    if (e.clientY < r.top + r.height / 2) return row.dataset.key!;
  }
  return null;
}

export function SidebarProjects({ projects }: { projects: SidebarProject[] }) {
  const [shown, setShown] = useOptimistic(projects);
  const [, start] = useTransition();
  const [dragging, setDragging] = useState<string>();
  const [slot, setSlot] = useState<Slot>();
  const sections = sidebarSections(shown);

  // Drop targets for sections that would otherwise have no rows to drop between.
  const ghost = (id: SectionId): Section[] => (dragging && !sections.some((s) => s.id === id) ? [{ id, kind: id === 'focus' ? 'focus' : 'group', group: '', projects: [] }] : []);
  const rendered = [...ghost('focus'), ...sections, ...ghost('group:')];

  const end = () => {
    setDragging(undefined);
    setSlot(undefined);
  };

  const onDragOver = (e: React.DragEvent<HTMLElement>, id: SectionId) => {
    if (!dragging) return;
    const before = slotBefore(e);
    const plan = dropPlan(sections, dragging, id, before);
    if (plan && 'error' in plan) {
      e.dataTransfer.dropEffect = 'none';
      if (slot) setSlot(undefined);
      return;
    }
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const next = plan ? { section: id, before } : undefined;
    if (next?.section !== slot?.section || next?.before !== slot?.before) setSlot(next);
  };

  const onDrop = (e: React.DragEvent<HTMLElement>, id: SectionId) => {
    if (!dragging) return;
    e.preventDefault();
    const key = dragging;
    const plan = dropPlan(sections, key, id, slotBefore(e));
    end();
    if (!plan || 'error' in plan) return;
    start(async () => {
      setShown(applyDrop(shown, key, plan.patch, plan.move));
      const r = await moveProjectTo(key, plan.patch ?? null, plan.move);
      if (r.error) toastError(r.error);
    });
  };

  return rendered.map((s) => {
    const isGhost = s.projects.length === 0;
    return (
      <div
        key={s.id}
        className={styles.section}
        data-slot-end={(!isGhost && slot?.section === s.id && slot.before === null) || undefined}
        onDragOver={(e) => onDragOver(e, s.id)}
        onDrop={(e) => onDrop(e, s.id)}
        onDragLeave={(e) => {
          if (slot?.section === s.id && !e.currentTarget.contains(e.relatedTarget as Node | null)) setSlot(undefined);
        }}
      >
        <div className={styles.heading}>{s.kind === 'focus' ? 'Focus' : s.group || 'Projects'}</div>
        {isGhost && (
          <div className={styles.ghost} data-over={slot?.section === s.id || undefined}>
            Drop here
          </div>
        )}
        {s.projects.map((p) => (
          <div
            key={p.key}
            data-key={p.key}
            className={styles.row}
            data-slot={(slot?.section === s.id && slot.before === p.key) || undefined}
            data-dragging={dragging === p.key || undefined}
            onDragStart={(e) => {
              e.dataTransfer.effectAllowed = 'move';
              // Changing the DOM inside dragstart can cancel the drag in Chrome.
              setTimeout(() => setDragging(p.key));
            }}
            onDragEnd={end}
          >
            <NavLink href={projectHref(p.key)} className={styles.item} activeClassName={styles.on}>
              <span className={p.focus ? styles.pin : styles.dot} aria-hidden>
                {p.focus ? '★' : '•'}
              </span>
              <span className={styles.label}>{p.name}</span>
            </NavLink>
          </div>
        ))}
      </div>
    );
  });
}
