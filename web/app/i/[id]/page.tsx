import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { claudeDir } from '../../../../src/config.ts';
import { bodyHash } from '../../../../src/ops.ts';
import { linkedPath } from '../../../../src/open.ts';
import { openLinkedFile, setIssueTitle } from '@/app/actions';
import { Flags, grillHref, projectHref } from '@/components/bits';
import { Chip, type Ref } from '@/components/Chip';
import { PrioritySelect, StatusSelect } from '@/components/controls';
import { TitleEdit } from '@/components/InlineEdit';
import { OpenFile } from '@/components/OpenFile';
import { PageBar, projectsCrumb } from '@/components/PageBar';
import panel from '@/components/PropsPanel.module.css';
import { StatusIcon } from '@/components/StatusIcon';
import ui from '@/components/ui.module.css';
import { ctx, openBlockers } from '@/lib/data';
import type { Issue } from '@/lib/types';
import { Comments } from './Comments';
import { BodyEditor } from './BodyEditor';
import { Blockers } from './Blockers';
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
  const dirs = { data: dir, claude: claudeDir() };
  const planPath = linkedPath(issue, 'plan', dirs);
  const candidates =issues.filter((t) => t.id !== issue.id && (t.status === 'idea' || t.status === 'todo' || t.status === 'doing')).map(ref);

  return (
    <>
      <PageBar
        crumbs={[projectsCrumb, { label: project?.name ?? issue.project, href: projectHref(issue.project) }, { label: issue.id, icon: <StatusIcon status={issue.status} /> }]}
        after={<Flags issue={issue} />}
      />
      <div className={ui.page}>
        <div className={panel.layout}>
          <article className={panel.main}>
            <TitleEdit key={issue.title} value={issue.title} label="Title" save={setIssueTitle.bind(null, issue.id)} />
            {open.length > 0 && (
              <p className={ui.warn}>
                Waiting on {open.map((b) => b.id).join(', ')}
              </p>
            )}
            <BodyEditor id={issue.id} body={issue.body} hash={bodyHash(issue.body)} />
            <Comments id={issue.id} comments={issue.comments} />
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
                <Blockers id={issue.id} project={issue.project} blockers={blockers} candidates={candidates} />
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
              <dd>{issue.updated.length > 10 ? <span title={issue.updated.replace('T', ' ')}>{issue.updated.slice(0, 10)}</span> : issue.updated}</dd>
              {issue.grill && (
                <>
                  <dt>Grill</dt>
                  <dd>
                    <Link className={panel.fileLink} href={grillHref(issue.grill)}>
                      {issue.grill}
                    </Link>
                  </dd>
                </>
              )}
              {planPath && (
                <>
                  <dt>Plan</dt>
                  <dd>
                    <OpenFile open={openLinkedFile.bind(null, issue.id, 'plan')} path={planPath} />
                  </dd>
                </>
              )}
              <dt>File</dt>
              <dd>
                <OpenFile open={openLinkedFile.bind(null, issue.id, 'file')} path={linkedPath(issue, 'file', dirs)!} />
              </dd>
            </dl>
            <DeleteIssue id={issue.id} dependents={dependents.map((d) => ({ id: d.id, title: d.title }))} />
          </aside>
        </div>
      </div>
    </>
  );
}
