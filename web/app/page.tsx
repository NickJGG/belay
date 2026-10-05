import Link from 'next/link';
import { projectHref } from '@/components/bits';
import { FocusToggle, TaskRow } from '@/components/controls';
import ui from '@/components/ui.module.css';
import { ctx, indexTasks, next, plural, projectCounts } from '@/lib/data';
import type { Project, Task } from '@/lib/types';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

function TaskRows({ tasks }: { tasks: Task[] }) {
  return (
    <ul className={ui.rows}>
      {tasks.map((t) => (
        <TaskRow key={t.id} task={t} />
      ))}
    </ul>
  );
}

function Section({ title, tasks }: { title: string; tasks: Task[] }) {
  if (!tasks.length) return null;
  return (
    <>
      <h3 className={ui.h3}>{title}</h3>
      <TaskRows tasks={tasks} />
    </>
  );
}

export default function Home() {
  const { projects, tasks } = ctx();
  if (!projects.length) {
    return (
      <div className={ui.page}>
        <h1 className={ui.title}>Home</h1>
        <p className={ui.empty}>
          No projects — run <code>tracker project add</code>.
        </p>
      </div>
    );
  }

  const byId = indexTasks(tasks);
  const n = next(projects, tasks);
  const focusKeys = projects.filter((p) => p.focus && p.status === 'active').map((p) => p.key);
  const ordered = (list: Project[]) =>
    [...list].sort((a, b) => (a.group ?? '').localeCompare(b.group ?? ''));
  const active = ordered(projects.filter((p) => p.status === 'active'));
  const groups = [...new Set(active.map((p) => p.group ?? ''))];
  const paused = ordered(projects.filter((p) => p.status === 'paused'));
  const archived = projects.filter((p) => p.status === 'archived').length;

  const projectRow = (p: Project) => {
    const c = projectCounts(p, tasks, byId);
    const counts = [
      c.doing ? `${c.doing} doing` : '',
      c.ready ? `${c.ready} ready` : '',
      c.blocked ? `${c.blocked} blocked` : '',
      c.ideas ? plural(c.ideas, 'idea') : '',
    ].filter(Boolean);
    return (
      <li key={p.key} className={ui.row}>
        <FocusToggle project={p} />
        <Link href={projectHref(p.key)} className={styles.name}>
          {p.name}
        </Link>
        <span className={`${ui.mono} ${ui.muted}`}>{p.key}</span>
        <span className={`${ui.grow} ${ui.muted}`}>{counts.join(' · ')}</span>
        <span className={`${ui.muted} ${styles.date}`}>{c.lastTouched}</span>
      </li>
    );
  };

  return (
    <div className={ui.page}>
      <header className={ui.header}>
        <h1 className={ui.title}>Next</h1>
      </header>
      <Section title="Doing" tasks={n.doing} />
      <Section title="High priority" tasks={n.high} />
      <Section title={`Ready — focus: ${focusKeys.join(', ') || 'none'}`} tasks={n.focus} />
      {!n.doing.length && !n.high.length && !n.focus.length && (
        <p className={ui.empty}>{focusKeys.length ? 'Nothing ready in focus projects.' : 'No focus projects — star one below.'}</p>
      )}
      {n.other.length > 0 && (
        <details className={ui.disclosure}>
          <summary>Ready elsewhere ({n.other.length})</summary>
          <TaskRows tasks={n.other} />
        </details>
      )}

      <h2 className={ui.h2}>Projects</h2>
      {groups.map((g) => (
        <section key={g || '-'}>
          {g && <h3 className={ui.h3}>{g}</h3>}
          <ul className={ui.rows}>{active.filter((p) => (p.group ?? '') === g).map(projectRow)}</ul>
        </section>
      ))}
      {!active.length && <p className={ui.empty}>No active projects.</p>}
      {paused.length > 0 && (
        <details className={ui.disclosure}>
          <summary>Paused ({paused.length})</summary>
          <ul className={ui.rows}>{paused.map(projectRow)}</ul>
        </details>
      )}
      {archived > 0 && (
        <p>
          <Link className={ui.link} href="/archived">
            {archived} archived
          </Link>
        </p>
      )}
    </div>
  );
}
