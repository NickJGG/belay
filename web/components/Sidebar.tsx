import { Archive, Inbox, Layers, Settings } from 'lucide-react';
import { ctx } from '@/lib/data';
import type { Project } from '@/lib/types';
import { NavLink } from './NavLink';
import { projectHref } from './bits';
import { SearchButton, ShortcutsButton } from './SidebarKeys';
import styles from './Sidebar.module.css';

function ProjectLink({ p }: { p: Project }) {
  return (
    <NavLink href={projectHref(p.key)} className={styles.item} activeClassName={styles.on}>
      <span className={p.focus ? styles.pin : styles.dot} aria-hidden>
        {p.focus ? '★' : '•'}
      </span>
      <span className={styles.label}>{p.name}</span>
    </NavLink>
  );
}

export function Sidebar() {
  const { projects, tasks } = ctx();
  const ideas = tasks.filter((t) => t.status === 'idea').length;
  const byKey = (a: Project, b: Project) => a.key.localeCompare(b.key);
  const focus = projects.filter((p) => p.status === 'active' && p.focus).sort(byKey);
  const rest = projects.filter((p) => p.status !== 'archived' && !(p.status === 'active' && p.focus));
  const groups = [...new Set(rest.map((p) => p.group ?? ''))].sort((a, b) => (a ? (b ? a.localeCompare(b) : -1) : 1));
  const archived = projects.filter((p) => p.status === 'archived').length;

  return (
    <nav className={styles.side} aria-label="Main">
      <NavLink href="/" className={styles.ws} activeClassName={styles.wsOn}>
        <i className={styles.logo} aria-hidden />
        Tracker
      </NavLink>
      <SearchButton />
      <NavLink href="/issues" className={styles.item} activeClassName={styles.on}>
        <Layers size={14} aria-hidden />
        <span className={styles.label}>All issues</span>
      </NavLink>
      <NavLink href="/issues?status=idea" className={styles.item} activeClassName={styles.on}>
        <Inbox size={14} aria-hidden />
        <span className={styles.label}>Ideas</span>
        {ideas > 0 && <span className={styles.count}>{ideas}</span>}
      </NavLink>

      {focus.length > 0 && <div className={styles.heading}>Focus</div>}
      {focus.map((p) => (
        <ProjectLink key={p.key} p={p} />
      ))}

      {groups.map((g) => (
        <div key={g || '-'} className={styles.group}>
          <div className={styles.heading}>{g || 'Projects'}</div>
          {rest
            .filter((p) => (p.group ?? '') === g)
            .sort((a, b) => Number(a.status === 'paused') - Number(b.status === 'paused') || byKey(a, b))
            .map((p) => (
              <ProjectLink key={p.key} p={p} />
            ))}
        </div>
      ))}

      <div className={styles.foot}>
        <ShortcutsButton />
        {archived > 0 && (
          <NavLink href="/archived" className={styles.item} activeClassName={styles.on}>
            <Archive size={14} aria-hidden />
            <span className={styles.label}>Archived</span>
            <span className={styles.count}>{archived}</span>
          </NavLink>
        )}
        <NavLink href="/settings" className={styles.item} activeClassName={styles.on}>
          <Settings size={14} aria-hidden />
          <span className={styles.label}>Settings</span>
        </NavLink>
      </div>
    </nav>
  );
}
