import Link from 'next/link';
import { Logo } from '@/components/bits';
import { IssueRow } from '@/components/controls';
import { PageBar } from '@/components/PageBar';
import ui from '@/components/ui.module.css';
import { ctx, next } from '@/lib/data';
import type { Issue } from '@/lib/types';

export const dynamic = 'force-dynamic';

function IssueRows({ issues }: { issues: Issue[] }) {
  return (
    <ul className={ui.rows}>
      {issues.map((t) => (
        <IssueRow key={t.id} issue={t} />
      ))}
    </ul>
  );
}

function Section({ title, issues }: { title: string; issues: Issue[] }) {
  if (!issues.length) return null;
  return (
    <>
      <h3 className={ui.h3}>{title}</h3>
      <IssueRows issues={issues} />
    </>
  );
}

export default function Home() {
  const { projects, issues } = ctx();
  if (!projects.length) {
    return (
      <>
        <PageBar crumbs={[{ label: 'Home', icon: <Logo /> }]} />
        <div className={ui.page}>
          <p className={ui.empty}>
            No projects — run <code>tracker project add</code>.
          </p>
        </div>
      </>
    );
  }

  const n = next(projects, issues);
  const focusKeys = projects.filter((p) => p.focus && p.status === 'active').map((p) => p.key);

  return (
    <>
      <PageBar crumbs={[{ label: 'Home', icon: <Logo /> }]} />
      <div className={ui.page}>
        <Section title="Doing" issues={n.doing} />
        <Section title="High priority" issues={n.high} />
        <Section title={`Ready — focus: ${focusKeys.join(', ') || 'none'}`} issues={n.focus} />
        {!n.doing.length && !n.high.length && !n.focus.length && (
          <p className={ui.empty}>
            {focusKeys.length ? (
              'Nothing ready in focus projects.'
            ) : (
              <>
                No focus projects — star one in{' '}
                <Link className={ui.link} href="/projects">
                  Projects
                </Link>
                .
              </>
            )}
          </p>
        )}
        {n.other.length > 0 && (
          <details className={ui.disclosure}>
            <summary>Ready elsewhere ({n.other.length})</summary>
            <IssueRows issues={n.other} />
          </details>
        )}
      </div>
    </>
  );
}
