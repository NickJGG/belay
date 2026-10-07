import Link from 'next/link';
import { idColumn, projectHref } from '@/components/bits';
import { FocusToggle } from '@/components/controls';
import { PageBar, projectsCrumb } from '@/components/PageBar';
import ui from '@/components/ui.module.css';
import { ctx } from '@/lib/data';
import type { Project } from '@/lib/types';
import styles from './projects.module.css';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Projects' };

export default function Projects() {
  const { projects } = ctx();
  const bar = <PageBar crumbs={[projectsCrumb]} />;
  if (!projects.length) {
    return (
      <>
        {bar}
        <div className={ui.page}>
          <p className={ui.empty}>
            No projects — run <code>belay project add</code>.
          </p>
        </div>
      </>
    );
  }

  const ordered = (list: Project[]) =>
    [...list].sort((a, b) => (a.group ?? '').localeCompare(b.group ?? ''));
  const active = ordered(projects.filter((p) => p.status === 'active'));
  const groups = [...new Set(active.map((p) => p.group ?? ''))];
  const paused = ordered(projects.filter((p) => p.status === 'paused'));
  const archived = projects.filter((p) => p.status === 'archived').length;

  const projectRow = (p: Project) => (
    <li key={p.key} className={ui.row}>
      <FocusToggle project={p} />
      <span className={ui.idTitle}>
        <Link href={projectHref(p.key)} className={`${ui.mono} ${ui.muted} ${ui.stretch} ${ui.idCol}`}>
          {p.key}
        </Link>
        <span className={`${ui.grow} ${styles.name}`}>{p.name}</span>
      </span>
    </li>
  );

  return (
    <>
      {bar}
      <div className={ui.page} style={idColumn([...active, ...paused].map((p) => p.key))}>
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
    </>
  );
}
