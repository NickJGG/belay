import Link from 'next/link';
import { projectHref } from '@/components/bits';
import { FocusToggle } from '@/components/controls';
import { PageBar, projectsCrumb } from '@/components/PageBar';
import ui from '@/components/ui.module.css';
import { ctx, indexIssues, plural, projectCounts } from '@/lib/data';
import type { Project } from '@/lib/types';
import styles from './projects.module.css';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Projects' };

export default function Projects() {
  const { projects, issues } = ctx();
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

  const byId = indexIssues(issues);
  const ordered = (list: Project[]) =>
    [...list].sort((a, b) => (a.group ?? '').localeCompare(b.group ?? ''));
  const active = ordered(projects.filter((p) => p.status === 'active'));
  const groups = [...new Set(active.map((p) => p.group ?? ''))];
  const paused = ordered(projects.filter((p) => p.status === 'paused'));
  const archived = projects.filter((p) => p.status === 'archived').length;

  const projectRow = (p: Project) => {
    const c = projectCounts(p, issues, byId);
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
      </li>
    );
  };

  return (
    <>
      {bar}
      <div className={ui.page}>
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
