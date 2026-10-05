import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { bodyHash } from '../../../../src/ops.ts';
import { normalizeStoredPath, issueFile } from '../../../../src/store.ts';
import { setIssueTitle } from '@/app/actions';
import { Flags, projectHref } from '@/components/bits';
import { PrioritySelect, StatusSelect } from '@/components/controls';
import { TitleEdit } from '@/components/InlineEdit';
import panel from '@/components/PropsPanel.module.css';
import ui from '@/components/ui.module.css';
import { ctx, openBlockers } from '@/lib/data';
import type { Issue } from '@/lib/types';
import { BodyEditor } from './BodyEditor';
import { Blockers, Chip, type Ref } from './Blockers';
import { DeleteIssue } from './DeleteIssue';
import styles from './issue.module.css';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ id: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const id = decodeURIComponent((await params).id).toUpperCase();
  const t = ctx().byId.get(id);
  return { title: t ? `${id} ${t.title}` : id };
}

const ref = (t: Issue): Ref => ({ id: t.id, title: t.title, status: t.status });

export default async function IssuePage({ params }: Props) {
  const id = decodeURIComponent((await params).id).toUpperCase();
  const { projects, issues, byId, dir } = ctx();
  const issue = byId.get(id);
  if (!issue) notFound();
  const project = projects.find((p) => p.key === issue.project);

  const blockers = issue.blocked_by.map((b): Ref => (byId.has(b) ? ref(byId.get(b)!) : { id: b }));
  const open = issue.status === 'todo' ? openBlockers(issue, byId) : [];
  const dependents = issues.filter((t) => t.blocked_by.includes(issue.id));
  const candidates = issues.filter((t) => t.id !== issue.id && (t.status === 'idea' || t.status === 'todo' || t.status === 'doing')).map(ref);

  return (
    <div className={styles.page}>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        <Link className={ui.link} href={projectHref(issue.project)}>
          {project?.name ?? issue.project}
        </Link>
        <span aria-hidden>›</span>
        <span className={ui.mono}>{issue.id}</span>
        <Flags issue={issue} />
      </nav>
      <div className={panel.layout}>
        <article className={panel.main}>
          <TitleEdit key={issue.title} value={issue.title} label="Title" save={setIssueTitle.bind(null, issue.id)} />
          {open.length > 0 && (
            <p className={ui.warn}>
              Waiting on {open.map((b) => b.id).join(', ')}
            </p>
          )}
          <BodyEditor id={issue.id} body={issue.body} hash={bodyHash(issue.body)} />
        </article>

        <aside className={panel.props} aria-label="Properties">
          <dl className={panel.propList}>
            <dt>Status</dt>
            <dd>
              <StatusSelect issue={issue} className={styles.select} />
            </dd>
            <dt>Priority</dt>
            <dd>
              <PrioritySelect issue={issue} className={styles.select} />
            </dd>
            <dt>Blocked by</dt>
            <dd>
              <Blockers id={issue.id} blockers={blockers} candidates={candidates} />
            </dd>
            {dependents.length > 0 && (
              <>
                <dt>Blocks</dt>
                <dd className={styles.blockers}>
                  {dependents.map((d) => (
                    <Chip key={d.id} r={ref(d)} />
                  ))}
                </dd>
              </>
            )}
            <dt>Source</dt>
            <dd>{issue.source}</dd>
            <dt>Created</dt>
            <dd>{issue.created}</dd>
            <dt>Updated</dt>
            <dd>{issue.updated}</dd>
            {issue.grill && (
              <>
                <dt>Grill</dt>
                <dd className={ui.mono}>{issue.grill}</dd>
              </>
            )}
            {issue.plan && (
              <>
                <dt>Plan</dt>
                <dd className={`${ui.mono} ${styles.wrap}`}>{issue.plan}</dd>
              </>
            )}
            <dt>File</dt>
            <dd className={`${ui.mono} ${ui.muted} ${styles.wrap}`}>{normalizeStoredPath(issueFile(dir, issue.id))}</dd>
          </dl>
          <DeleteIssue id={issue.id} dependents={dependents.map((d) => ({ id: d.id, title: d.title }))} />
        </aside>
      </div>
    </div>
  );
}
