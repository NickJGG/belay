import { TaskRow } from '@/components/controls';
import { StatusIcon } from '@/components/StatusIcon';
import ui from '@/components/ui.module.css';
import { ctx, filterTasks, oldestFirst, parseTaskFilter } from '@/lib/data';
import { IssueFilters } from './IssueFilters';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Issues' };

type Query = Record<string, string | undefined>;

function heading(q: Query): string {
  const keys = Object.keys(q).filter((k) => q[k]);
  if (keys.length === 1 && q.status === 'idea') return 'Ideas';
  return keys.length ? 'Issues' : 'All open issues';
}

export default async function Issues({ searchParams }: { searchParams: Promise<Query> }) {
  const q = await searchParams;
  const filter = parseTaskFilter(q);
  const { projects, tasks, byId } = ctx();
  const shown = filterTasks(tasks, filter, byId).sort(oldestFirst);
  return (
    <div className={ui.page}>
      <header className={ui.header}>
        <h1 className={ui.title}>{heading(q)}</h1>
        <span className={ui.muted}>{shown.length}</span>
      </header>
      <IssueFilters projects={projects.map((p) => p.key).sort()} />
      {!shown.length && <p className={ui.empty}>No matching issues.</p>}
      {filter.statuses.map((s) => {
        const list = shown.filter((t) => t.status === s);
        if (!list.length) return null;
        return (
          <section key={s}>
            <h3 className={ui.h3}>
              <StatusIcon status={s} />
              {s} <span>{list.length}</span>
            </h3>
            <ul className={ui.rows}>
              {list.map((t) => (
                <TaskRow key={t.id} task={t} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
