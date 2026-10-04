import Link from 'next/link';
import { projectHref } from '@/components/bits';
import ui from '@/components/ui.module.css';
import { ctx } from '@/lib/data';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Archived' };

export default function Archived() {
  const archived = ctx()
    .projects.filter((p) => p.status === 'archived')
    .sort((a, b) => a.key.localeCompare(b.key));
  return (
    <div className={ui.page}>
      <header className={ui.header}>
        <h1 className={ui.title}>Archived projects</h1>
      </header>
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
  );
}
