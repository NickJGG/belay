import Link from 'next/link';
import { projectHref } from '@/components/bits';
import { FocusToggle } from '@/components/controls';
import { PageBar, projectsCrumb } from '@/components/PageBar';
import ui from '@/components/ui.module.css';
import { commitTimes, ctx, heatLevel, heatmap, heatRange, indexIssues, plural, projectCounts, workDay } from '@/lib/data';
import type { Heatmap } from '../../../src/heatmap.ts';
import type { Project } from '@/lib/types';
import styles from './projects.module.css';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Projects' };

const WEEKS = 8;
const SHADES = 4;

function Heat({ heat, day }: { heat: Heatmap; day: string }) {
  const weeks = Array.from({ length: heat.days.length / 7 }, (_, w) => heat.days.slice(w * 7, w * 7 + 7));
  return (
    <section className={styles.heat}>
      <h3 className={ui.h3}>Moved, last {weeks.length} weeks</h3>
      <div className={styles.heatScroll}>
        <table className={styles.heatTable}>
          <thead>
            <tr>
              <th />
              {weeks.map((w) => (
                <th key={w[0]} className={styles.week} scope="col">
                  {w[0].slice(5)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {heat.rows.map((r) => (
              <tr key={r.project}>
                <th scope="row">
                  <Link href={projectHref(r.project)} className={`${ui.mono} ${styles.heatKey}`}>
                    {r.project}
                  </Link>
                </th>
                {weeks.map((w, wi) => (
                  <td key={w[0]}>
                    <span className={styles.cells}>
                      {w.map((d, i) => {
                        const n = r.counts[wi * 7 + i];
                        return (
                          <span
                            key={d}
                            className={styles.cell}
                            data-level={n === null ? undefined : heatLevel(n)}
                            data-today={d === day || undefined}
                            title={n === null ? d : `${r.project} ${d}: ${n ? plural(n, 'move') : 'no moves'}`}
                          />
                        );
                      })}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className={styles.legend} aria-hidden>
        Fewer
        {Array.from({ length: SHADES + 1 }, (_, l) => (
          <span key={l} className={styles.cell} data-level={l} />
        ))}
        More
      </p>
    </section>
  );
}

export default function Projects() {
  const data = ctx();
  const { projects, issues } = data;
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

  const day = workDay();
  const { from, to } = heatRange(day, WEEKS);
  const shown = [...active, ...paused];
  const commits = Object.fromEntries(shown.map((p) => [p.key, commitTimes(p.key, from, to)]));
  const heat = heatmap(shown, issues, data.logs('0000-01-01', day), commits, day, WEEKS);
  const lastMoved = new Map(heat.rows.map((r) => [r.project, r.lastMoved]));

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
        {lastMoved.get(p.key) ? (
          <span className={`${ui.muted} ${styles.date}`} title="Last moved: an issue changed status, a comment, a log entry or a commit">
            {lastMoved.get(p.key)}
          </span>
        ) : (
          <span className={`${ui.muted} ${styles.date} ${styles.edited}`} title="Not moved since status changes were recorded; last edited">
            {c.lastTouched}
          </span>
        )}
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
        {shown.length > 0 && <Heat heat={heat} day={day} />}
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
