import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { DEFAULT_VIEW_STATUSES, VIEW_STATUSES, isDefaultStatuses, toggleStatus, type ViewStatus } from '../../../../src/view.ts';
import { setProjectGoal, setProjectGroup, setProjectKinds, setProjectName } from '@/app/actions';
import { Activity } from '@/components/Activity';
import { idColumn, projectHref } from '@/components/bits';
import { FocusToggle, ProjectStatusSelect, IssueRow } from '@/components/controls';
import { TextEdit } from '@/components/InlineEdit';
import { PageBar, projectsCrumb } from '@/components/PageBar';
import panel from '@/components/PropsPanel.module.css';
import { StatusGroup } from '@/components/StatusGroup';
import ui from '@/components/ui.module.css';
import { activity, addDays, ctx, goalSpec, parseIssueFilter, parseIssueSort, projectBoard, projectCounts, workDay } from '@/lib/data';
import { WEEK, windowDays } from '@/lib/days';
import type { Issue, IssueStatus } from '@/lib/types';
import { Logs } from './Logs';
import { Tabs } from './Tabs';
import { ViewMenu } from './ViewMenu';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

const TABS = ['activity', 'issues', 'ideas', 'logs'] as const;
type Tab = (typeof TABS)[number];

interface Props {
  params: Promise<{ key: string }>;
  searchParams: Promise<Record<string, string | undefined>>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: decodeURIComponent((await params).key).toUpperCase() };
}

export default async function ProjectPage({ params, searchParams }: Props) {
  const key = decodeURIComponent((await params).key).toUpperCase();
  const view = await searchParams;
  const data = ctx();
  const { projects, issues, byId } = data;
  const project = projects.find((p) => p.key === key);
  if (!project) notFound();

  const tab: Tab = view.tab === 'activity' || view.tab === 'logs' || view.tab === 'ideas' ? view.tab : 'issues';
  const day = workDay();
  const filter = parseIssueFilter(view, DEFAULT_VIEW_STATUSES);
  const sort = parseIssueSort(view);
  const picked = VIEW_STATUSES.filter((s) => filter.statuses.includes(s));
  const statuses: readonly ViewStatus[] = picked.length ? picked : DEFAULT_VIEW_STATUSES;
  const { priority, source, readiness } = filter;
  const showDropped = statuses.includes('dropped');
  const showOlder = view.older === '1';
  const board = projectBoard(project.key, issues, {
    today: day,
    older: showOlder,
    sort,
    // Dropped issues are always kept, so the Show dropped link can count them.
    filter: tab === 'ideas' ? { statuses: ['idea'], priority, source } : { ...filter, project: undefined, statuses: [...new Set([...statuses, 'dropped' as const])] },
  });
  const active = !!(priority || source || sort) || (tab === 'issues' && (!!readiness || !isDefaultStatuses(statuses)));
  const query = Object.entries(view).filter((e): e is [string, string] => typeof e[1] === 'string');
  const href = (edit: (q: URLSearchParams) => void) => {
    const q = new URLSearchParams(query);
    edit(q);
    return `${projectHref(project.key)}${q.size ? `?${q}` : ''}`;
  };
  const droppedHref = href((q) => {
    const status = toggleStatus(statuses, 'dropped');
    if (status) q.set('status', status);
    else q.delete('status');
  });
  const section = (status: IssueStatus, list: Issue[], footer?: React.ReactNode) =>
    (list.length > 0 || footer) && (
      <StatusGroup key={status} status={status} count={list.length}>
        <ul className={ui.rows}>
          {list.map((t) => (
            <IssueRow key={t.id} issue={t} />
          ))}
        </ul>
        {footer}
      </StatusGroup>
    );
  const counts = projectCounts(project, issues, byId);
  const tabHref = (t: Tab) => `${projectHref(project.key)}${t === 'issues' ? '' : `?tab=${t}`}`;
  const allLogs = tab === 'logs' ? data.logs('0000-01-01', day).filter((e) => e.project === project.key) : [];
  const logs = view.all === '1' ? allLogs : allLogs.filter((e) => e.day > addDays(day, -28));
  const days = windowDays(view.days);
  const from = addDays(day, -(days - 1));
  const feed = tab === 'activity' ? activity(projects, issues, data.logs(from, day), from, day, project.key) : [];
  const visible =
    tab === 'ideas'
      ? board.idea.length
      : board.todo.length + board.doing.length + board.done.length + board.olderDone + (showDropped ? board.dropped.length : 0);
  const empty = !visible && (
    <p className={ui.empty}>
      {active ? (
        <>
          No matching {tab}.{' '}
          <Link className={ui.link} href={tabHref(tab)}>
            Reset
          </Link>
        </>
      ) : (
        `No ${tab}.`
      )}
    </p>
  );

  return (
    <>
      <PageBar crumbs={[projectsCrumb, { label: project.name }]} />
      <div className={ui.page}>
        <div className={panel.layout}>
          <div className={panel.main} style={idColumn(tab === 'ideas' ? board.idea : [...board.todo, ...board.doing, ...board.done, ...(showDropped ? board.dropped : [])])}>
            <div className={styles.tabRow}>
              <Tabs tabs={TABS} current={tab} hrefs={Object.fromEntries(TABS.map((t) => [t, tabHref(t)])) as Record<Tab, string>} />
              {(tab === 'issues' || tab === 'ideas') && (
                <ViewMenu
                  tab={tab}
                  statuses={statuses}
                  priority={priority}
                  source={source}
                  readiness={readiness}
                  sort={sort}
                  active={active}
                />
              )}
            </div>
            {tab === 'activity' ? (
              <Activity days={feed} today={day} scope={project.key} earlierHref={`${tabHref('activity')}&days=${days + WEEK}`} />
            ) : tab === 'logs' ? (
              <Logs entries={logs} today={day} older={allLogs.length - logs.length} moreHref={`${tabHref('logs')}&all=1`} />
            ) : tab === 'ideas' ? (
              empty || section('idea', board.idea)
            ) : (
              <>
              {empty}
              {section('todo', board.todo)}
              {section('doing', board.doing)}
              {section(
                'done',
                board.done,
                board.olderDone > 0 && (
                  <Link className={`${ui.link} ${styles.more}`} href={href((q) => (showOlder ? q.delete('older') : q.set('older', '1')))}>
                    {showOlder ? 'Hide older' : `${board.olderDone} older`}
                  </Link>
                ),
              )}
              {showDropped && section('dropped', board.dropped)}
              {board.dropped.length > 0 && (
                <p>
                  <Link className={ui.link} href={droppedHref}>
                    {showDropped ? 'Hide dropped' : `Show dropped (${board.dropped.length})`}
                  </Link>
                </p>
              )}
              </>
            )}
          </div>

          <aside className={panel.props} aria-label="Properties">
            <dl className={panel.propList}>
              <dt>Name</dt>
              <dd>
                <TextEdit value={project.name} label="Name" save={setProjectName.bind(null, project.key)} />
              </dd>
              <dt>Status</dt>
              <dd>
                <ProjectStatusSelect project={project} className={panel.control} />
              </dd>
              <dt>Focus</dt>
              <dd className={panel.icon}>
                <FocusToggle project={project} />
              </dd>
              <dt>Group</dt>
              <dd>
                <TextEdit value={project.group ?? ''} label="Group" placeholder="None" save={setProjectGroup.bind(null, project.key)} />
              </dd>
              <dt>Goal</dt>
              <dd>
                <TextEdit
                  value={project.goal ? goalSpec(project.goal) : ''}
                  label="Goal"
                  placeholder="None: 5 days, 10 applied, by date"
                  save={setProjectGoal.bind(null, project.key)}
                />
              </dd>
              <dt>Kinds</dt>
              <dd>
                <TextEdit value={project.kinds?.join(', ') ?? ''} label="Kinds" placeholder="None" save={setProjectKinds.bind(null, project.key)} />
              </dd>
              <dt>Key</dt>
              <dd className={ui.mono}>{project.key}</dd>
              <dt>Paths</dt>
              <dd>
                <ul className={`${ui.mono} ${panel.paths}`}>
                  {project.paths.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </dd>
              <dt>Last touched</dt>
              <dd>{counts.lastTouched ?? <span className={ui.muted}>Never</span>}</dd>
            </dl>
          </aside>
        </div>
      </div>
    </>
  );
}
