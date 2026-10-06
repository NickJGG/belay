import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { today } from '../../../../src/store.ts';
import { setProjectGoal, setProjectGroup, setProjectKinds, setProjectName } from '@/app/actions';
import { Activity } from '@/components/Activity';
import { idColumn, projectHref } from '@/components/bits';
import { FocusToggle, ProjectStatusSelect, IssueRow } from '@/components/controls';
import { TextEdit } from '@/components/InlineEdit';
import { PageBar, projectsCrumb } from '@/components/PageBar';
import panel from '@/components/PropsPanel.module.css';
import { StatusGroup } from '@/components/StatusGroup';
import ui from '@/components/ui.module.css';
import { activity, addDays, ctx, goalSpec, projectBoard, projectCounts, workDay } from '@/lib/data';
import { WEEK, windowDays } from '@/lib/days';
import type { Issue, IssueStatus } from '@/lib/types';
import { Logs } from './Logs';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ tab?: string; dropped?: string; older?: string; all?: string; days?: string }>;
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

  const tab = view.tab === 'activity' || view.tab === 'logs' || view.tab === 'ideas' ? view.tab : 'issues';
  const showDropped = view.dropped === '1';
  const showOlder = view.older === '1';
  const board = projectBoard(project.key, issues, { today: today(), older: showOlder });
  const href = (o: { dropped: boolean; older: boolean }) => {
    const q = new URLSearchParams();
    if (o.dropped) q.set('dropped', '1');
    if (o.older) q.set('older', '1');
    return `${projectHref(project.key)}${q.size ? `?${q}` : ''}`;
  };
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
  const tabHref = (t: typeof tab) => `${projectHref(project.key)}${t === 'issues' ? '' : `?tab=${t}`}`;
  const day = workDay();
  const allLogs = tab === 'logs' ? data.logs('0000-01-01', day).filter((e) => e.project === project.key) : [];
  const logs = view.all === '1' ? allLogs : allLogs.filter((e) => e.day > addDays(day, -28));
  const days = windowDays(view.days);
  const from = addDays(day, -(days - 1));
  const feed = tab === 'activity' ? activity(projects, issues, data.logs(from, day), from, day, project.key) : [];
  const empty = !board.todo.length && !board.doing.length && !board.done.length && !board.olderDone;

  return (
    <>
      <PageBar crumbs={[projectsCrumb, { label: project.name }]} />
      <div className={ui.page}>
        <div className={panel.layout}>
          <div className={panel.main} style={idColumn(tab === 'ideas' ? board.idea : [...board.todo, ...board.doing, ...board.done, ...(showDropped ? board.dropped : [])])}>
            <nav className={styles.tabs} aria-label="View">
              {(['activity', 'issues', 'ideas', 'logs'] as const).map((t) => (
                <Link key={t} className={styles.tab} href={tabHref(t)} aria-current={tab === t ? 'page' : undefined}>
                  {t[0].toUpperCase() + t.slice(1)}
                </Link>
              ))}
            </nav>
            {tab === 'activity' ? (
              <Activity days={feed} today={day} scope={project.key} earlierHref={`${tabHref('activity')}&days=${days + WEEK}`} />
            ) : tab === 'logs' ? (
              <Logs entries={logs} today={day} older={allLogs.length - logs.length} moreHref={`${tabHref('logs')}&all=1`} />
            ) : tab === 'ideas' ? (
              board.idea.length ? section('idea', board.idea) : <p className={ui.empty}>No ideas.</p>
            ) : (
              <>
              {empty && <p className={ui.empty}>No issues.</p>}
              {section('todo', board.todo)}
              {section('doing', board.doing)}
              {section(
                'done',
                board.done,
                board.olderDone > 0 && (
                  <Link className={`${ui.link} ${styles.more}`} href={href({ dropped: showDropped, older: !showOlder })}>
                    {showOlder ? 'Hide older' : `${board.olderDone} older`}
                  </Link>
                ),
              )}
              {showDropped && section('dropped', board.dropped)}
              {board.dropped.length > 0 && (
                <p>
                  <Link className={ui.link} href={href({ dropped: !showDropped, older: showOlder })}>
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
