'use client';
import { Check, X } from 'lucide-react';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Dropdown, type Option } from '@/components/Dropdown';
import styles from './issues.module.css';

const STATUS_OPTIONS: Option[] = [
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
  const select = (key: string, label: string, options: Option[]) => {
    const value = search.get(key) ?? '';
    return <Dropdown label={label} value={value} options={options} onChange={(v) => set(key, v)} className={value ? styles.chipOn : styles.chip} />;
  };
  const readiness = search.get('ready');
  const toggle = (value: string, label: string) => {
    const on = readiness === value;
    return (
      <button type="button" className={on ? styles.chipOn : styles.chip} aria-pressed={on} onClick={() => set('ready', on ? '' : value)}>
        {on && <Check size={12} aria-hidden />}
        {label}
      </button>
    );
  };

  return (
    <div className={styles.filters}>
      {select('status', 'Status', STATUS_OPTIONS)}
      {select('project', 'Project', [['', 'Any project'], ...projects.map((p): Option => [p, p])])}
      {select('priority', 'Priority', [['', 'Any priority'], ['high', 'High']])}
      {select('source', 'Source', [['', 'Any source'], ['claude', 'Claude'], ['user', 'User']])}
      {toggle('1', 'Ready only')}
      {toggle('blocked', 'Blocked only')}
      {search.size > 0 && (
        <Link className={styles.clear} href={pathname}>
          <X size={12} aria-hidden />
          Clear
        </Link>
      )}
    </div>
  );
}
