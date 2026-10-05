import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { bodyHash } from '../../../../src/ops.ts';
import { normalizeStoredPath, taskFile } from '../../../../src/store.ts';
import { setTaskTitle } from '@/app/actions';
import { Flags, projectHref } from '@/components/bits';
import { PrioritySelect, StatusSelect } from '@/components/controls';
import { TitleEdit } from '@/components/InlineEdit';
import panel from '@/components/PropsPanel.module.css';
import ui from '@/components/ui.module.css';
import { ctx, openBlockers } from '@/lib/data';
import type { Task } from '@/lib/types';
import { BodyEditor } from './BodyEditor';
import { Blockers, Chip, type Ref } from './Blockers';
import { DeleteTask } from './DeleteTask';
import styles from './task.module.css';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = decodeURIComponent((await params).id).toUpperCase();
  const t = ctx().byId.get(id);
  return { title: t ? `${id} ${t.title}` : id };
}

const ref = (t: Task): Ref => ({ id: t.id, title: t.title, status: t.status });

export default async function TaskPage({ params }: Props) {
  const id = decodeURIComponent((await params).id).toUpperCase();
  const { projects, tasks, byId, dir } = ctx();
  const task = byId.get(id);
  if (!task) notFound();
  const project = projects.find((p) => p.key === task.project);

  const blockers = task.blocked_by.map((b): Ref => (byId.has(b) ? ref(byId.get(b)!) : { id: b }));
  const open = task.status === 'todo' ? openBlockers(task, byId) : [];
  const dependents = tasks.filter((t) => t.blocked_by.includes(task.id));
  const candidates = tasks.filter((t) => t.id !== task.id && (t.status === 'idea' || t.status === 'todo' || t.status === 'doing')).map(ref);

  return (
    <div className={styles.page}>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <Link className={ui.link} href={projectHref(task.project)}>
          {project?.name ?? task.project}
        </Link>
        <span aria-hidden>›</span>
        <span className={ui.mono}>{task.id}</span>
        <Flags task={task} />
      </nav>
      <div className={panel.layout}>
        <article className={panel.main}>
          <TitleEdit key={task.title} value={task.title} label="Title" save={setTaskTitle.bind(null, task.id)} />
          {open.length > 0 && (
            <p className={ui.warn}>
              Waiting on {open.map((b) => b.id).join(', ')}
            </p>
          )}
          <BodyEditor id={task.id} body={task.body} hash={bodyHash(task.body)} />
        </article>

        <aside className={panel.props} aria-label="Properties">
          <dl className={panel.propList}>
            <dt>Status</dt>
            <dd>
              <StatusSelect task={task} className={styles.select} />
            </dd>
            <dt>Priority</dt>
            <dd>
              <PrioritySelect task={task} className={styles.select} />
            </dd>
            <dt>Blocked by</dt>
            <dd>
              <Blockers id={task.id} blockers={blockers} candidates={candidates} />
            </dd>
            {dependents.length > 0 && (
              <>
                <dt>Blocks</dt>
                <dd className={styles.blockers}>
                  {dependents.map((d) => (
                    <Chip key={d.id} r={ref(d)} />
                  ))}
                </dd>
              </>
            )}
            <dt>Source</dt>
            <dd>{task.source}</dd>
            <dt>Created</dt>
            <dd>{task.created}</dd>
            <dt>Updated</dt>
            <dd>{task.updated}</dd>
            {task.grill && (
              <>
                <dt>Grill</dt>
                <dd className={ui.mono}>{task.grill}</dd>
              </>
            )}
            {task.plan && (
              <>
                <dt>Plan</dt>
                <dd className={`${ui.mono} ${styles.wrap}`}>{task.plan}</dd>
              </>
            )}
            <dt>File</dt>
            <dd className={`${ui.mono} ${ui.muted} ${styles.wrap}`}>{normalizeStoredPath(taskFile(dir, task.id))}</dd>
          </dl>
          <DeleteTask id={task.id} dependents={dependents.map((d) => ({ id: d.id, title: d.title }))} />
        </aside>
      </div>
    </div>
  );
}
