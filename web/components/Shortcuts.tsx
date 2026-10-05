'use client';
import { Kbd, useModKey } from './Kbd';
import { Modal } from './Modal';
import styles from './Keys.module.css';

export function Shortcuts({ open, onClose }: { open: boolean; onClose: () => void }) {
  const mod = useModKey();
  const groups: [string, [string[], string][]][] = [
    [
      'General',
      [
        [[mod, 'K'], 'Command palette'],
        [['/'], 'Search'],
        [['C'], 'Create an issue'],
        [['?'], 'This cheat sheet'],
      ],
    ],
    [
      'Selection',
      [
        [['J', 'K'], 'Next / previous issue'],
        [['↵'], 'Open the selected issue'],
        [['Esc'], 'Clear the selection'],
      ],
    ],
    [
      'Selected issue, or this page’s',
      [
        [['1'], 'Idea'],
        [['2'], 'Todo'],
        [['3'], 'Doing'],
        [['4'], 'Done'],
        [['5'], 'Dropped'],
        [['E'], 'Edit: open it, or edit its description on its page'],
      ],
    ],
  ];
  return (
    <Modal open={open} onClose={onClose} label="Keyboard shortcuts" className={styles.sheet}>
      <div className={styles.sheetBody}>
        <h2 className={styles.sheetTitle}>Keyboard shortcuts</h2>
        {groups.map(([heading, rows]) => (
          <section key={heading}>
            <h3 className={styles.sheetHeading}>{heading}</h3>
            <dl className={styles.sheetRows}>
              {rows.map(([keys, what]) => (
                <div key={what} className={styles.sheetRow}>
                  <dt>{what}</dt>
                  <dd>
                    {keys.map((k) => (
                      <Kbd key={k}>{k}</Kbd>
                    ))}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
        <p className={styles.sheetNote}>Keys are off while typing in a field, except {mod}+K.</p>
      </div>
    </Modal>
  );
}
