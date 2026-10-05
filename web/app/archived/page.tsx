import { Archive } from 'lucide-react';
import Link from 'next/link';
import { projectHref } from '@/components/bits';
import { PageBar, projectsCrumb } from '@/components/PageBar';
import ui from '@/components/ui.module.css';
import { ctx } from '@/lib/data';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Archived' };

export default function Archived() {
  const archived = ctx()
    .projects.filter((p) => p.status === 'archived')
    .sort((a, b) => a.key.localeCompare(b.key));
  return (
    <>
      <PageBar crumbs={[projectsCrumb, { label: 'Archived', icon: <Archive size={14} aria-hidden /> }]} />
      <div className={ui.page}>
        {archived.length === 0 ? (
          <p className={ui.empty}>None.</p>
        ) : (
          <ul className={ui.rows}>
            {archived.map((p) => (
              <li key={p.key} className={ui.row}>
                <Link href={projectHref(p.key)}>{p.name}</Link>
                <span className={`${ui.mono} ${ui.muted}`}>{p.key}</span>
                <span className={`${ui.grow} ${ui.muted}`}>{p.group}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}
