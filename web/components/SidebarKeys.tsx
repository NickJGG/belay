'use client';
import { Command, Keyboard, SquarePen } from 'lucide-react';
import { Kbd, useModKey } from './Kbd';
import { useKeys } from './Keys';
import styles from './Sidebar.module.css';

export function SearchButton() {
  const keys = useKeys();
  const mod = useModKey();
  return (
    <button type="button" className={`${styles.item} ${styles.button}`} onClick={() => keys?.openPalette()}>
      <Command size={14} aria-hidden />
      <span className={styles.label}>Search or run…</span>
      <span className={styles.hint}>
        <Kbd>{mod}</Kbd>
        <Kbd>K</Kbd>
      </span>
    </button>
  );
}

export function CreateButton() {
  const keys = useKeys();
  return (
    <button type="button" className={`${styles.item} ${styles.button}`} onClick={() => keys?.create()}>
      <SquarePen size={14} aria-hidden />
      <span className={styles.label}>Create</span>
      <span className={styles.hint}>
        <Kbd>C</Kbd>
      </span>
    </button>
  );
}

export function ShortcutsButton() {
  const keys = useKeys();
  return (
    <button type="button" className={`${styles.item} ${styles.button}`} onClick={() => keys?.openHelp()}>
      <Keyboard size={14} aria-hidden />
      <span className={styles.label}>Shortcuts</span>
      <span className={styles.hint}>
        <Kbd>?</Kbd>
      </span>
    </button>
  );
}
