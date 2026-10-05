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
  const ready = search.get('ready') === '1';

  return (
    <div className={styles.filters}>
      {select('status', 'Status', STATUS_OPTIONS)}
      {select('project', 'Project', [['', 'Any project'], ...projects.map((p): Option => [p, p])])}
      {select('priority', 'Priority', [['', 'Any priority'], ['high', 'High']])}
      {select('source', 'Source', [['', 'Any source'], ['claude', 'Claude'], ['user', 'User']])}
      <button type="button" className={ready ? styles.chipOn : styles.chip} aria-pressed={ready} onClick={() => set('ready', ready ? '' : '1')}>
        {ready && <Check size={12} aria-hidden />}
        Ready only
      </button>
      {search.size > 0 && (
        <Link className={styles.clear} href={pathname}>
          <X size={12} aria-hidden />
          Clear
        </Link>
      )}
    </div>
  );
}
