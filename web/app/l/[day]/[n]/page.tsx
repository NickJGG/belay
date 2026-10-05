import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { firstLine, loadLog, logFile, type LogEntry } from '../../../../../src/logs.ts';
import { logDays } from '../../../../../src/ops.ts';
import { linkCandidates } from '../../../../../src/picker.ts';
import { isDay } from '../../../../../src/workday.ts';
import { openLogFile } from '@/app/actions';
import { projectHref } from '@/components/bits';
import type { Ref } from '@/components/Chip';
import { OpenFile } from '@/components/OpenFile';
import { PageBar, projectsCrumb } from '@/components/PageBar';
import panel from '@/components/PropsPanel.module.css';
import ui from '@/components/ui.module.css';
import { ctx, workDay } from '@/lib/data';
import { dayLabel } from '../../../p/[key]/Logs';
import { DeleteLog } from './DeleteLog';
import { LogProps } from './LogProps';
import { LogTextEditor } from './LogTextEditor';

export const dynamic = 'force-dynamic';

interface Props {
  params: Promise<{ day: string; n: string }>;
  searchParams: Promise<{ at?: string }>;
}

/** The entry at the address, or why there isn't one: `gone` when it's no longer the entry `?at` named. */
async function load({ params, searchParams }: Props): Promise<{ day: string; n: number; entries: LogEntry[]; entry?: LogEntry; gone: boolean }> {
  const { day, n: raw } = await params;
  const { at } = await searchParams;
  const n = Number(raw);
  if (!isDay(day) || !Number.isInteger(n) || n < 1) notFound();
  const entries = loadLog(ctx().dir, day);
  const entry = entries[n - 1];
  if (at === undefined && !entry) notFound();
  return at !== undefined && entry?.at !== at ? { day, n, entries, gone: true } : { day, n, entries, entry, gone: false };
}

export async function generateMetadata(props: Props): Promise<Metadata> {
  const { day, n, entry } = await load(props);
  return { title: entry ? firstLine(entry.text).line : `${day}/${n}` };
}

const logsHref = (key: string) => `${projectHref(key)}?tab=logs`;

export default async function LogPage(props: Props) {
  const { day, n, entries, entry, gone } = await load(props);
  const { projects, issues, byId, dir } = ctx();
  const address = `${day}/${n}`;

  if (!entry || gone) {
    // The same entry may still be in the file under another number, which tells us its project.
    const { at } = await props.searchParams;
    const key = entries.find((e) => e.at === at)?.project;
    return (
      <>
        <PageBar crumbs={[projectsCrumb, { label: address }]} />
        <div className={panel.page}>
          <p className={ui.empty}>
            This log entry moved or was deleted.{' '}
            <Link className={ui.link} href={key ? logsHref(key) : '/projects'}>
              {key ? `Back to ${projects.find((p) => p.key === key)?.name ?? key} logs` : 'Back to projects'}
            </Link>
          </p>
        </div>
      </>
    );
  }

  const project = projects.find((p) => p.key === entry.project);
  const today = workDay();
  const days = logDays(today);
  const ref = (id: string): Ref => {
    const t = byId.get(id);
    return t ? { id: t.id, title: t.title, status: t.status } : { id };
  };

  return (
    <>
      <PageBar
        crumbs={[
          projectsCrumb,
          { label: project?.name ?? entry.project, href: projectHref(entry.project) },
          { label: 'Logs', href: logsHref(entry.project) },
          { label: address },
        ]}
        after={entry.by === 'claude' && <span className={ui.src}>claude</span>}
      />
      <div className={panel.page}>
        <div className={panel.layout}>
          <article className={panel.main}>
            <LogTextEditor address={address} at={entry.at} text={entry.text} />
          </article>

          <aside className={panel.props} aria-label="Properties">
            <dl className={panel.propList}>
              <LogProps
                address={address}
                at={entry.at}
                project={entry.project}
                day={day}
                days={days.includes(day) ? days.map((d) => [d, dayLabel(d, today)]) : []}
                dayText={dayLabel(day, today)}
                kind={entry.kind}
                kinds={project?.kinds ?? []}
                count={entry.count}
                minutes={entry.minutes}
                issue={entry.issue ? ref(entry.issue) : undefined}
                candidates={linkCandidates(issues, entry.project, entry.issue).map((t) => ref(t.id))}
              />
              <dt>By</dt>
              <dd>{entry.by}</dd>
              <dt>Logged</dt>
              <dd className={ui.mono}>{entry.at.replace('T', ' ')}</dd>
              <dt>File</dt>
              <dd>
                <OpenFile open={openLogFile.bind(null, day)} path={logFile(dir, day)} />
              </dd>
            </dl>
            <DeleteLog address={address} at={entry.at} />
          </aside>
        </div>
      </div>
    </>
  );
}
