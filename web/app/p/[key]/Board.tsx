'use client';
import { useOptimistic, useState, useTransition } from 'react';
import { DndContext, DragOverlay, PointerSensor, useDroppable, useSensor, useSensors, type DragEndEvent } from '@dnd-kit/core';
import { setTaskStatus } from '@/app/actions';
import { Flags } from '@/components/bits';
import { StatusIcon } from '@/components/StatusIcon';
import { toastError } from '@/components/Toaster';
import ui from '@/components/ui.module.css';
import type { Task, TaskStatus } from '@/lib/types';
import { TaskCard } from './TaskCard';
import styles from './page.module.css';

export interface BoardColumn {
  status: TaskStatus;
  title: string;
  /** Each card's server-rendered detail, keyed by task ID. */
  cards: { task: Task; detail: React.ReactNode }[];
  footer?: React.ReactNode;
}

/**
 * Status changes, whether dropped, clicked or keyed, live here rather than in each card, so a card
 * moves to its new column the moment it changes and moves back if the write fails.
 */
export function Board({ columns, extra }: { columns: BoardColumn[]; extra?: BoardColumn }) {
  const [moves, addMove] = useOptimistic<Record<string, TaskStatus>, [string, TaskStatus]>({}, (m, [id, s]) => ({ ...m, [id]: s }));
  const [, start] = useTransition();
  const [dragging, setDragging] = useState<Task>();
  // A small threshold, so a click on a card still opens it rather than starting a drag.
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 5 } }));

  const all = [...columns, ...(extra ? [extra] : [])].flatMap((c) => c.cards);
  const statusOf = (t: Task) => moves[t.id] ?? t.status;
  const move = (id: string, s: TaskStatus) =>
    start(async () => {
      addMove([id, s]);
      const r = await setTaskStatus(id, s);
      if (r.error) toastError(r.error);
    });

  const onDragEnd = (e: DragEndEvent) => {
    setDragging(undefined);
    const task = all.find((c) => c.task.id === e.active.id)?.task;
    const to = e.over?.id as TaskStatus | undefined;
    if (task && to && statusOf(task) !== to) move(task.id, to);
  };

  const column = (c: BoardColumn) => {
    // Cards keep the server's order; one just moved in goes at the end until the refresh sorts it.
    const cards = [
      ...all.filter((x) => x.task.status === c.status && statusOf(x.task) === c.status),
      ...all.filter((x) => x.task.status !== c.status && statusOf(x.task) === c.status),
    ];
    return (
      <Column key={c.status} column={c} count={cards.length} accepts={dragging !== undefined && statusOf(dragging) !== c.status}>
        {cards.map(({ task, detail }) => (
          <TaskCard key={task.id} task={task} status={statusOf(task)} setStatus={(s) => move(task.id, s)}>
            {detail}
          </TaskCard>
        ))}
      </Column>
    );
  };

  return (
    <DndContext
      id="board"
      sensors={sensors}
      onDragStart={(e) => setDragging(all.find((c) => c.task.id === e.active.id)?.task)}
      onDragEnd={onDragEnd}
      onDragCancel={() => setDragging(undefined)}
    >
      <div className={styles.board}>{columns.map(column)}</div>
      {extra && <div className={styles.dropped}>{column(extra)}</div>}
      <DragOverlay dropAnimation={null}>{dragging && <CardGhost task={dragging} status={statusOf(dragging)} />}</DragOverlay>
    </DndContext>
  );
}

function Column({ column, count, accepts, children }: { column: BoardColumn; count: number; accepts: boolean; children: React.ReactNode }) {
  const { setNodeRef, isOver } = useDroppable({ id: column.status });
  return (
    <section ref={setNodeRef} className={`${styles.col} ${accepts && isOver ? styles.over : ''}`}>
      <h3 className={styles.colHead}>
        <StatusIcon status={column.status} />
        {column.title}
        <span className={ui.muted}>{count}</span>
      </h3>
      {children}
      {column.footer}
    </section>
  );
}

function CardGhost({ task, status }: { task: Task; status: TaskStatus }) {
  return (
    <div className={`${styles.card} ${styles.ghost}`}>
      <div className={styles.summary}>
        <StatusIcon status={status} />
        <span className={`${ui.mono} ${ui.muted}`}>{task.id}</span>
        <Flags task={task} />
        <span className={styles.cardTitle}>{task.title}</span>
      </div>
    </div>
  );
}
