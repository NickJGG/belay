import Link from 'next/link';
import { Logo } from '@/components/bits';
import { IssueRow } from '@/components/controls';
import { PageBar } from '@/components/PageBar';
import { Group } from '@/components/StatusGroup';
import { StatusIcon } from '@/components/StatusIcon';
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

function Section({ id, icon, label, issues, defaultOpen }: { id: string; icon: React.ReactNode; label: string; issues: Issue[]; defaultOpen?: boolean }) {
  if (!issues.length) return null;
  return (
    <Group id={id} icon={icon} label={label} count={issues.length} defaultOpen={defaultOpen}>
      <IssueRows issues={issues} />
    </Group>
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
        <Section id="doing" icon={<StatusIcon status="doing" />} label="Doing" issues={n.doing} />
        <Section id="high" icon={<span className={ui.high}>!!</span>} label="High priority" issues={n.high} />
        <Section id="focus" icon={<StatusIcon status="todo" />} label={`Ready — focus: ${focusKeys.join(', ') || 'none'}`} issues={n.focus} />
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
        <Section id="elsewhere" icon={<StatusIcon status="todo" />} label="Ready elsewhere" issues={n.other} defaultOpen={false} />
      </div>
    </>
  );
}
