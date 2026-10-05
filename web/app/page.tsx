import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import { Logo } from '@/components/bits';
import { IssueRow } from '@/components/controls';
import { PageBar } from '@/components/PageBar';
import { Group } from '@/components/StatusGroup';
import { StatusIcon } from '@/components/StatusIcon';
import { ThisWeek } from '@/components/ThisWeek';
import ui from '@/components/ui.module.css';
import { addDays, burndown, commitTimes, ctx, goalOf, next, urgencies, weekDays, weekStart, weekSummary, workDay } from '@/lib/data';
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
  const data = ctx();
  const { projects, issues } = data;
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

  const day = workDay();
  const week = weekStart(day);
  const sunday = addDays(week, 6);
  const goalProjects = projects.filter((p) => goalOf(p));
  const commits = Object.fromEntries(goalProjects.map((p) => [p.key, commitTimes(p.key, week, sunday)]));
  const goalRows = weekSummary(goalProjects, issues, data.logs(week, sunday), commits, week, day).filter((r) => r.goal);
  const burndowns = Object.fromEntries(
    goalProjects.flatMap((p) => {
      const g = goalOf(p);
      return g && 'target' in g ? [[p.key, { set: g.set, points: burndown(p, issues, day) }]] : [];
    }),
  );
  const n = next(projects, issues, urgencies(goalRows.map((r) => r.goal!)));
  const focusKeys = projects.filter((p) => p.focus && p.status === 'active').map((p) => p.key);

  return (
    <>
      <PageBar crumbs={[{ label: 'Home', icon: <Logo /> }]} />
      <div className={ui.page}>
        {goalRows.length > 0 && (
          <Group id="week" icon={<CalendarDays size={14} aria-hidden />} label="This week" count={goalRows.length}>
            <ThisWeek rows={goalRows} week={weekDays(week)} burndowns={burndowns} />
          </Group>
        )}
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
