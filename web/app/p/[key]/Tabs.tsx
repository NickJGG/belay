'use client';

import Link from 'next/link';
import { useState } from 'react';
import styles from './page.module.css';

export function Tabs<T extends string>({ tabs, current, hrefs }: { tabs: readonly T[]; current: T; hrefs: Record<T, string> }) {
  // Moves the indicator on click, before the server render of the new tab arrives.
  const [active, setActive] = useState(current);
  const [synced, setSynced] = useState(current);
  // Off until a click: if the stylesheet lands after first paint (dev does this), the indicator would slide in from the first tab.
  const [animate, setAnimate] = useState(false);
  if (current !== synced) {
    setSynced(current);
    setActive(current);
  }
  return (
    <nav
      className={styles.tabs}
      aria-label="View"
      data-animate={animate || undefined}
      style={{ '--n': tabs.length, '--i': tabs.indexOf(active) } as React.CSSProperties}
    >
      <span className={styles.indicator} aria-hidden />
      {tabs.map((t) => (
        <Link
          key={t}
          className={styles.tab}
          href={hrefs[t]}
          aria-current={active === t ? 'page' : undefined}
          onClick={() => {
            setAnimate(true);
            setActive(t);
          }}
        >
          {t[0].toUpperCase() + t.slice(1)}
        </Link>
      ))}
    </nav>
  );
}
