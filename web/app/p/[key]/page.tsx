import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { normalizeStoredPath, taskFile, today } from '../../../../src/store.ts';
import { TaskLink, projectHref } from '@/components/bits';
import { FocusToggle } from '@/components/controls';
import ui from '@/components/ui.module.css';
import {
  attachCommits,
  claudeDir,
  clip,
  ctx,
  duration,
  loadGrillSessions,
  localStamp,
  openBlockers,
  projectBoard,
  recentSessions,
  unlinkedGrill,
  type GrillSession,
} from '@/lib/data';
import type { Task, TaskStatus } from '@/lib/types';
import { Board, type BoardColumn } from './Board';
import { ProjectEdit } from './ProjectEdit';
import { QuickAdd } from './QuickAdd';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ dropped?: string; older?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: decodeURIComponent((await params).key).toUpperCase() };
}

function CardDetail({ task, tasks }: { task: Task; tasks: Task[] }) {
  const { byId, dir } = ctx();
  const describe = (id: string) => {
    const b = byId.get(id);
    return (
      <span key={id} className={styles.ref}>
        <TaskLink id={id} /> <span className={ui.muted}>{b ? b.status : 'missing'}</span>
      </span>
    );
  };
  const open = task.status === 'todo' ? openBlockers(task, byId) : [];
  const blocks = tasks.filter((x) => x.blocked_by.includes(task.id));
  return (
    <>
      {open.length > 0 && <div className={ui.warn}>Waiting on {open.map((b) => describe(b.id))}</div>}
      {task.body && <pre className={styles.body}>{task.body}</pre>}
      <dl className={styles.fields}>
        {task.blocked_by.length > 0 && (
          <>
            <dt>Blocked by</dt>
            <dd>{task.blocked_by.map(describe)}</dd>
          </>
        )}
        {blocks.length > 0 && (
          <>
            <dt>Blocks</dt>
            <dd>{blocks.map((b) => describe(b.id))}</dd>
          </>
        )}
        {task.grill && (
          <>
            <dt>Grill</dt>
            <dd className={ui.mono}>{task.grill}</dd>
          </>
        )}
        {task.plan && (
          <>
            <dt>Plan</dt>
            <dd className={ui.mono}>{task.plan}</dd>
          </>
        )}
        <dt>Dates</dt>
        <dd>
          created {task.created}, updated {task.updated}
        </dd>
        <dt>File</dt>
        <dd className={`${ui.mono} ${ui.muted} ${styles.path}`}>{normalizeStoredPath(taskFile(dir, task.id))}</dd>
      </dl>
    </>
  );
}

export default async function ProjectPage({ params, searchParams }: Props) {
  const key = decodeURIComponent((await params).key).toUpperCase();
  const view = await searchParams;
  const { projects, tasks } = ctx();
  const project = projects.find((p) => p.key === key);
  if (!project) notFound();

  const showDropped = view.dropped === '1';
  const showOlder = view.older === '1';
  const board = projectBoard(project.key, tasks, { today: today(), older: showOlder });
  const href = (o: { dropped: boolean; older: boolean }) => {
    const q = new URLSearchParams();
    if (o.dropped) q.set('dropped', '1');
    if (o.older) q.set('older', '1');
    return `${projectHref(project.key)}${q.size ? `?${q}` : ''}`;
  };
  const column = (status: TaskStatus, title: string, list: Task[], footer?: React.ReactNode): BoardColumn => ({
    status,
    title,
    cards: list.map((t) => ({ task: t, detail: <CardDetail task={t} tasks={tasks} /> })),
    footer,
  });

  const claude = claudeDir();
  const sessions = recentSessions(claude, projects, { project, limit: 10 });
  attachCommits(sessions, projects);
  const { tagged, matched } = unlinkedGrill(project, tasks, loadGrillSessions(claude));
  const byUpdated = (a: GrillSession, b: GrillSession) => (b.updated ?? '').localeCompare(a.updated ?? '');
  const inProgress = (g: GrillSession) => g.status === 'in-progress';
  const grill = [...[...tagged].sort((a, b) => Number(inProgress(b)) - Number(inProgress(a)) || byUpdated(a, b)), ...[...matched].sort(byUpdated)];

  return (
    <div className={`${ui.page} ${styles.wide}`}>
      <header className={ui.header}>
        <FocusToggle project={project} />
        <h1 className={ui.title}>{project.name}</h1>
        <span className={`${ui.mono} ${ui.muted}`}>{project.key}</span>
      </header>
      <div className={styles.meta}>
        <span>{project.status}</span>
        {project.group && <span>group {project.group}</span>}
        {project.paths.map((p) => (
          <span key={p} className={ui.mono}>
            {p}
          </span>
        ))}
      </div>
      <ProjectEdit project={project} />
      <QuickAdd projectKey={project.key} />

      <Board
        columns={[
          column('idea', 'Idea', board.idea),
          column('todo', 'Todo', board.todo),
          column('doing', 'Doing', board.doing),
          column(
            'done',
            'Done',
            board.done,
            board.olderDone > 0 && (
              <Link className={`${ui.link} ${styles.more}`} href={href({ dropped: showDropped, older: !showOlder })}>
                {showOlder ? 'Hide older' : `${board.olderDone} older`}
              </Link>
            ),
          ),
        ]}
        extra={showDropped && board.dropped.length > 0 ? column('dropped', 'Dropped', board.dropped) : undefined}
      />
      {board.dropped.length > 0 &&
        (showDropped ? (
          <>
            <Link className={ui.link} href={href({ dropped: false, older: showOlder })}>
              Hide dropped
            </Link>
          </>
        ) : (
          <p>
            <Link className={ui.link} href={href({ dropped: true, older: showOlder })}>
              Show dropped ({board.dropped.length})
            </Link>
          </p>
        ))}

      <h2 className={ui.h2}>Recent sessions</h2>
      {sessions.length === 0 ? (
        <p className={ui.empty}>No sessions.</p>
      ) : (
        <ul className={ui.rows}>
          {sessions.map((s) => {
            const { date, time } = localStamp(s.start);
            const commits = s.commits ?? [];
            return (
              <li key={s.id} className={styles.session}>
                <span className={`${ui.mono} ${ui.muted}`}>
                  {date} {time}
                </span>
                <span className={`${ui.mono} ${ui.muted} ${styles.dur}`}>{duration(s.start, s.end)}</span>
                <div className={ui.grow}>
                  <div className={styles.sessionTitle}>{s.title}</div>
                  {commits.slice(0, 5).map((c) => (
                    <div key={c.hash} className={`${ui.mono} ${ui.muted} ${styles.commit}`}>
                      {c.hash} {c.subject}
                    </div>
                  ))}
                  {commits.length > 5 && <div className={`${ui.mono} ${ui.muted}`}>… {commits.length - 5} more</div>}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {grill.length > 0 && (
        <>
          <h2 className={ui.h2}>Grill sessions not linked to a task</h2>
          <ul className={ui.rows}>
            {grill.map((g) => (
              <li key={g.slug} className={`${ui.row} ${g.project && inProgress(g) ? styles.inProgress : ''}`}>
                <span className={ui.mono}>{g.slug}</span>
                <span className={ui.muted}>{g.status}</span>
                <span className={ui.muted}>{g.updated}</span>
                <span className={ui.grow} title={g.topic}>
                  {clip(g.topic, 140)}
                  {!g.project && <span className={ui.muted}> (matched)</span>}
                </span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
