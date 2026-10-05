import { Archive, Inbox, Layers, Settings } from 'lucide-react';
import { ctx } from '@/lib/data';
import { NavLink } from './NavLink';
import { SearchButton, ShortcutsButton } from './SidebarKeys';
import { SidebarProjects } from './SidebarProjects';
import styles from './Sidebar.module.css';

export function Sidebar() {
  const { projects, tasks } = ctx();
  const ideas = tasks.filter((t) => t.status === 'idea').length;
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

      <SidebarProjects
        projects={projects
          .filter((p) => p.status !== 'archived')
          .map((p) => ({ key: p.key, name: p.name, status: p.status, focus: p.focus, group: p.group }))}
      />

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
