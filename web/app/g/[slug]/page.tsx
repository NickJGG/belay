import { existsSync } from 'node:fs';
import { MessagesSquare } from 'lucide-react';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { grillRoots } from '../../../../src/config.ts';
import { grillFile, grillPreview } from '../../../../src/grill.ts';
import { openGrillFile, openGrillPreview } from '@/app/actions';
import { projectHref, projectTabHref } from '@/components/bits';
import { Chip } from '@/components/Chip';
import { Markdown } from '@/components/Markdown';
import { OpenFile } from '@/components/OpenFile';
import { PageBar, projectsCrumb } from '@/components/PageBar';
import panel from '@/components/PropsPanel.module.css';
import ui from '@/components/ui.module.css';
import { ctx, grillSession } from '@/lib/data';
import styles from './grill.module.css';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ slug: string }>;
}

const slugOf = async (params: Props['params']) => decodeURIComponent((await params).slug);

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const slug = await slugOf(params);
  return { title: grillSession(slug)?.topic || slug };
}

/** A grill session, read-only. Edits happen in the grill skill, so the page never writes. */
export default async function GrillPage({ params }: Props) {
  const slug = await slugOf(params);
  const g = grillSession(slug);
  if (!g) notFound();
  const { projects, issues } = ctx();
  const project = projects.find((p) => p.key === g.project?.toUpperCase());
  const linked = issues.filter((t) => t.grill === slug);
  const roots = grillRoots();
  const preview = grillPreview(roots, slug);

  return (
    <>
      <PageBar
        crumbs={[
          projectsCrumb,
          ...(project
            ? [
                { label: project.name, href: projectHref(project.key) },
                { label: 'Grills', href: projectTabHref(project.key, 'grills') },
              ]
            : []),
          { label: slug, icon: <MessagesSquare size={14} aria-hidden /> },
        ]}
      />
      <div className={ui.page}>
        <div className={panel.layout}>
          <article className={panel.main}>
            <h1 className={styles.title}>{g.topic || slug}</h1>
            <Markdown>{g.body}</Markdown>
          </article>

          <aside className={panel.props} aria-label="Properties">
            <dl className={panel.propList}>
              {g.status && (
                <>
                  <dt>Status</dt>
                  <dd>{g.status}</dd>
                </>
              )}
              {g.project && (
                <>
                  <dt>Project</dt>
                  <dd>{project ? <Link href={projectHref(project.key)}>{project.name}</Link> : g.project}</dd>
                </>
              )}
              {g.started && (
                <>
                  <dt>Started</dt>
                  <dd>{g.started}</dd>
                </>
              )}
              {g.updated && (
                <>
                  <dt>Updated</dt>
                  <dd>{g.updated}</dd>
                </>
              )}
              {linked.length > 0 && (
                <>
                  <dt>Issues</dt>
                  <dd className={styles.chips}>
                    {linked.map((t) => (
                      <Chip key={t.id} r={{ id: t.id, title: t.title, status: t.status }} />
                    ))}
                  </dd>
                </>
              )}
              <dt>File</dt>
              <dd>
                <OpenFile open={openGrillFile.bind(null, slug)} path={grillFile(roots, slug)} />
              </dd>
              <dt>Sear</dt>
              <dd>
                <a className={panel.fileLink} href={`http://127.0.0.1:8790/s/${slug}`} target="_blank" rel="noreferrer">
                  Open in Sear
                </a>
              </dd>
              {existsSync(preview) && (
                <>
                  <dt>Preview</dt>
                  <dd>
                    <OpenFile open={openGrillPreview.bind(null, slug)} path={preview} />
                  </dd>
                </>
              )}
            </dl>
          </aside>
        </div>
      </div>
    </>
  );
}
