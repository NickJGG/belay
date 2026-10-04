'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import ui from '@/components/ui.module.css';
import styles from './issues.module.css';

const STATUS_OPTIONS: [string, string][] = [
  ['', 'Open'],
  ['idea', 'Idea'],
  ['todo', 'Todo'],
  ['doing', 'Doing'],
  ['done', 'Done'],
  ['dropped', 'Dropped'],
  ['all', 'Any status'],
];

/** Every control writes straight to the URL, so a filtered view can be bookmarked or linked. */
export function IssueFilters({ projects }: { projects: string[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const search = useSearchParams();
  const set = (key: string, value: string) => {
    const q = new URLSearchParams(search);
    if (value) q.set(key, value);
    else q.delete(key);
    router.push(q.size ? `${pathname}?${q}` : pathname);
  };
  const select = (key: string, label: string, options: [string, string][]) => (
    <select className={ui.input} aria-label={label} value={search.get(key) ?? ''} onChange={(e) => set(key, e.target.value)}>
      {options.map(([v, l]) => (
        <option key={v} value={v}>
          {l}
        </option>
      ))}
    </select>
  );

  return (
    <div className={styles.filters}>
      {select('status', 'Status', STATUS_OPTIONS)}
      {select('project', 'Project', [['', 'Any project'], ...projects.map((p): [string, string] => [p, p])])}
      {select('priority', 'Priority', [['', 'Any priority'], ['high', 'High']])}
      {select('source', 'Source', [['', 'Any source'], ['claude', 'Claude'], ['user', 'User']])}
      <label className={styles.check}>
        <input type="checkbox" checked={search.get('ready') === '1'} onChange={(e) => set('ready', e.target.checked ? '1' : '')} />
        Ready only
      </label>
      {search.size > 0 && (
        <Link className={ui.link} href={pathname}>
          Clear
        </Link>
      )}
    </div>
  );
}
