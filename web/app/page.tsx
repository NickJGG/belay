import Link from 'next/link';
import { Activity } from '@/components/Activity';
import { idColumn, Logo } from '@/components/bits';
import { IssueRow } from '@/components/controls';
import home from '@/components/Home.module.css';
import { InFlight } from '@/components/InFlight';
import { PageBar } from '@/components/PageBar';
import ui from '@/components/ui.module.css';
import {
  activity,
  addDays,
  ctx,
  doingSince,
  grillSessions,
  inFlight,
  next,
  oldestFirst,
  workDay,
} from '@/lib/data';
import { WEEK, windowDays } from '@/lib/days';

export const dynamic = 'force-dynamic';

const UP_NEXT_FOCUS = 3;
const IDEAS_SHOWN = 5;

export default async function Home({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = windowDays((await searchParams).days);
  const data = ctx();
  const { projects, issues } = data;
  if (!projects.length) {
    return (
      <>
        <PageBar crumbs={[{ label: 'Home', icon: <Logo /> }]} />
        <div className={ui.page}>
          <p className={ui.empty}>
            No projects — run <code>belay project add</code>.
          </p>
        </div>
      </>
    );
  }

  const day = workDay();
  const n = next(projects, issues);
  const upNext = [...n.high, ...n.focus.slice(0, UP_NEXT_FOCUS)];
  const ideas = issues.filter((t) => t.status === 'idea').sort(oldestFirst);

  const from = addDays(day, -(days - 1));
  // Back to the oldest doing issue's start too, so each one's latest linked log entry is in range.
  const logsFrom = issues.filter((t) => t.status === 'doing').reduce((min, t) => (doingSince(t) < min ? doingSince(t) : min), from);
  const logs = data.logs(logsFrom, day);
  const flight = inFlight(projects, issues, logs, grillSessions(), day);

  return (
    <>
      <PageBar crumbs={[{ label: 'Home', icon: <Logo /> }]} />
      <div className={ui.page}>
        <div className={home.layout}>
          <div className={home.main}>
            <h2 className={ui.h2}>In flight</h2>
            <InFlight data={flight} />
            <h2 className={ui.h2}>Activity</h2>
            <Activity days={activity(projects, issues, logs, from, day)} today={day} earlierHref={`/?days=${days + WEEK}`} />
          </div>

          <aside className={home.rail} aria-label="This week and up next">
            <h2 className={ui.h2}>Up next</h2>
            {upNext.length ? (
              <ul className={ui.rows} style={idColumn(upNext.map((t) => t.id))}>
                {upNext.map((t) => (
                  <IssueRow key={t.id} issue={t} />
                ))}
              </ul>
            ) : (
              <p className={ui.empty}>Nothing ready in focus projects.</p>
            )}
            {ideas.length > 0 && (
              <>
                <h2 className={ui.h2}>Ideas to triage</h2>
                <ul className={ui.rows} style={idColumn(ideas.slice(0, IDEAS_SHOWN).map((t) => t.id))}>
                  {ideas.slice(0, IDEAS_SHOWN).map((t) => (
                    <IssueRow key={t.id} issue={t} />
                  ))}
                </ul>
                <Link className={`${ui.link} ${home.viewAll}`} href="/issues?status=idea">
                  View all {ideas.length} →
                </Link>
              </>
            )}
          </aside>
        </div>
      </div>
    </>
  );
}
