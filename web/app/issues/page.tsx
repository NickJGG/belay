import { Inbox, Layers } from 'lucide-react';
import { BOARD_ORDER } from '../../../src/view.ts';
import { idColumn } from '@/components/bits';
import { IssueRow } from '@/components/controls';
import { PageBar } from '@/components/PageBar';
import { StatusGroup } from '@/components/StatusGroup';
import ui from '@/components/ui.module.css';
import { ctx, filterIssues, oldestFirst, parseIssueFilter } from '@/lib/data';
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
  const filter = parseIssueFilter(q);
  const { projects, issues, byId } = ctx();
  const shown = filterIssues(issues, filter, byId).sort(oldestFirst);
  const title = heading(q);
  return (
    <>
      <PageBar crumbs={[{ label: title, icon: title === 'Ideas' ? <Inbox size={14} aria-hidden /> : <Layers size={14} aria-hidden /> }]} after={<span className={ui.muted}>{shown.length}</span>} />
      <div className={ui.page} style={idColumn(shown)}>
        <IssueFilters projects={projects.map((p) => p.key).sort()} />
        {!shown.length && <p className={ui.empty}>No matching issues.</p>}
        {BOARD_ORDER.filter((s) => filter.statuses.includes(s)).map((s) => {
          const list = shown.filter((t) => t.status === s);
          if (!list.length) return null;
          return (
            <StatusGroup key={s} status={s} count={list.length}>
              <ul className={ui.rows}>
                {list.map((t) => (
                  <IssueRow key={t.id} issue={t} />
                ))}
              </ul>
            </StatusGroup>
          );
        })}
      </div>
    </>
  );
}
