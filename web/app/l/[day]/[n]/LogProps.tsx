'use client';
import { useTransition } from 'react';
import type { LogPatch } from '../../../../../src/ops.ts';
import { editLogEntry } from '@/app/actions';
import type { Ref } from '@/components/Chip';
import { Dropdown, type Option } from '@/components/Dropdown';
import { TextEdit } from '@/components/InlineEdit';
import { IssuePicker } from '@/components/IssuePicker';
import panel from '@/components/PropsPanel.module.css';
import { toastError } from '@/components/Toaster';

/** '' clears; anything else must be a whole number, which the op range-checks. */
function numPatch(v: string): number | null {
  const s = v.trim();
  if (!s) return null;
  const n = Number(s);
  if (!Number.isInteger(n)) throw new Error(`'${s}' is not a whole number`);
  return n;
}

/** The editable properties of a log entry. Each saves on its own; a day move navigates to the new address. */
export function LogProps({
  address,
  at,
  project,
  day,
  days,
  dayText,
  kind,
  kinds,
  count,
  minutes,
  issue,
  candidates,
}: {
  address: string;
  at: string;
  project: string;
  day: string;
  /** The days it may move to, or none when its own day is past the backdate window. */
  days: Option[];
  dayText: string;
  kind?: string;
  kinds: string[];
  count?: number;
  minutes?: number;
  issue?: Ref;
  candidates: Ref[];
}) {
  const [pending, start] = useTransition();
  const save = (patch: LogPatch) => editLogEntry(address, at, patch);
  const apply = (patch: LogPatch) =>
    start(async () => {
      const r = await save(patch);
      if (r.error) toastError(r.error);
    });
  const saveNum = (field: 'count' | 'minutes') => async (v: string) => {
    try {
      return await save({ [field]: numPatch(v) });
    } catch (e) {
      return { error: (e as Error).message };
    }
  };
  const kindOptions: Option[] = [['', 'None'], ...[...new Set([...kinds, ...(kind ? [kind] : [])])].map((k): Option => [k, k])];

  return (
    <>
      <dt>Day</dt>
      <dd>{days.length ? <Dropdown label="Day" value={day} options={days} onChange={(d) => apply({ day: d })} className={panel.control} /> : dayText}</dd>
      {kindOptions.length > 1 && (
        <>
          <dt>Kind</dt>
          <dd>
            <Dropdown label="Kind" value={kind ?? ''} options={kindOptions} onChange={(k) => apply({ kind: k })} className={panel.control} />
          </dd>
        </>
      )}
      {kind && (
        <>
          <dt>Count</dt>
          <dd>
            <TextEdit value={count ? String(count) : ''} label="Count" placeholder="1" save={saveNum('count')} />
          </dd>
        </>
      )}
      <dt>Minutes</dt>
      <dd>
        <TextEdit value={minutes ? String(minutes) : ''} label="Minutes" placeholder="None" save={saveNum('minutes')} />
      </dd>
      <dt>Issue</dt>
      <dd>
        <IssuePicker
          label="Issue"
          value={issue ? [issue] : []}
          onChange={(ids) => apply({ issue: ids.at(-1) ?? '' })}
          candidates={candidates}
          preferProject={project}
          disabled={pending}
        />
      </dd>
    </>
  );
}
