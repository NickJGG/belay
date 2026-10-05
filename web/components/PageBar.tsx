import { Fragment } from 'react';
import { ChevronRight, FolderKanban } from 'lucide-react';
import Link from 'next/link';
import { LogButton } from './LogButton';
import styles from './PageBar.module.css';

type Crumb = { label: React.ReactNode; href?: string; icon?: React.ReactNode };

export const projectsCrumb: Crumb = { label: 'Projects', href: '/projects', icon: <FolderKanban size={14} aria-hidden /> };

function Content({ c }: { c: Crumb }) {
  return (
    <>
      {c.icon}
      <span className={styles.text}>{c.label}</span>
    </>
  );
}

/** The sticky top bar on every page. The last crumb is the page's <h1>, and `after` follows it. Log work sits at the right. */
export function PageBar({ crumbs, after }: { crumbs: Crumb[]; after?: React.ReactNode }) {
  const parents = crumbs.slice(0, -1);
  const last = crumbs[crumbs.length - 1];
  return (
    <header className={styles.bar}>
      <nav className={styles.crumbs} aria-label="Breadcrumb">
        {parents.map((c, i) => (
          <Fragment key={i}>
            {c.href ? (
              <Link className={`${styles.crumb} ${styles.parent} ${styles.button}`} href={c.href}>
                <Content c={c} />
              </Link>
            ) : (
              <span className={`${styles.crumb} ${styles.parent}`}>
                <Content c={c} />
              </span>
            )}
            <ChevronRight className={styles.sep} size={14} aria-hidden />
          </Fragment>
        ))}
        <h1 className={`${styles.crumb} ${styles.current}`}>
          <Content c={last} />
        </h1>
        {after}
      </nav>
      <LogButton />
    </header>
  );
}
