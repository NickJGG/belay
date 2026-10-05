import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { today } from '../../../../src/store.ts';
import { setProjectGroup, setProjectName } from '@/app/actions';
import { projectHref } from '@/components/bits';
import { FocusToggle, ProjectStatusSelect, IssueRow } from '@/components/controls';
import { TextEdit, TitleEdit } from '@/components/InlineEdit';
import panel from '@/components/PropsPanel.module.css';
import { StatusGroup } from '@/components/StatusGroup';
import ui from '@/components/ui.module.css';
import { ctx, projectBoard, projectCounts } from '@/lib/data';
import type { Issue, IssueStatus } from '@/lib/types';
import { NewIssueButton } from './NewIssueButton';
import styles from './page.module.css';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ key: string }>;
  searchParams: Promise<{ dropped?: string; older?: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  return { title: decodeURIComponent((await params).key).toUpperCase() };
}

export default async function ProjectPage({ params, searchParams }: Props) {
  const key = decodeURIComponent((await params).key).toUpperCase();
  const view = await searchParams;
  const { projects, issues, byId } = ctx();
  const project = projects.find((p) => p.key === key);
  if (!project) notFound();

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
  const issuesHref = (filter: string) => `/issues?project=${encodeURIComponent(project.key)}&${filter}`;
  const empty = !board.idea.length && !board.todo.length && !board.doing.length && !board.done.length && !board.olderDone;

  return (
    <div className={ui.page}>
      <div className={panel.layout}>
        <div className={panel.main}>
          <div className={styles.titleRow}>
            <TitleEdit key={project.name} value={project.name} label="Name" save={setProjectName.bind(null, project.key)} />
            <NewIssueButton className={styles.newIssue} />
          </div>

          {empty && <p className={ui.empty}>No issues.</p>}
          {section('idea', board.idea)}
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
        </div>

        <aside className={panel.props} aria-label="Properties">
          <dl className={panel.propList}>
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
          <div className={panel.counts}>
            <Link className={panel.count} href={issuesHref('status=doing')}>
              <strong>{counts.doing}</strong>
              <span>doing</span>
            </Link>
            <Link className={panel.count} href={issuesHref('ready=1')}>
              <strong>{counts.ready}</strong>
              <span>ready</span>
            </Link>
            <div className={panel.count} title="Todo with open blockers">
              <strong>{counts.blocked}</strong>
              <span>blocked</span>
            </div>
            <Link className={panel.count} href={issuesHref('status=idea')}>
              <strong>{counts.ideas}</strong>
              <span>ideas</span>
            </Link>
          </div>
        </aside>
      </div>
    </div>
  );
}
