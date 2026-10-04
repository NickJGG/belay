'use client';
import { useTransition } from 'react';
import { TriangleAlert } from 'lucide-react';
import { updateSettings } from '@/app/actions';
import { toastError } from '@/components/Toaster';
import ui from '@/components/ui.module.css';
import type { Accent } from '@/lib/accents';
import type { Theme } from '@/lib/types';
import styles from './settings.module.css';

export function SettingsForm({ accents, accent, theme }: { accents: Accent[]; accent: string; theme: Theme }) {
  const [pending, start] = useTransition();
  const save = (a: string, t: string) =>
    start(async () => {
      const r = await updateSettings(a, t);
      if (r.error) toastError(r.error);
    });

  return (
    <>
      <h2 className={ui.h2}>Theme</h2>
      <select className={ui.input} aria-label="Theme" value={theme} disabled={pending} onChange={(e) => save(accent, e.target.value)}>
        <option value="system">System</option>
        <option value="dark">Dark</option>
        <option value="light">Light</option>
      </select>

      <h2 className={ui.h2}>Accent</h2>
      <div className={styles.swatches} role="radiogroup" aria-label="Accent">
        {accents.map((a) => (
          <button
            key={a.key}
            type="button"
            role="radio"
            aria-checked={a.key === accent}
            className={styles.swatch}
            disabled={pending}
            onClick={() => save(a.key, theme)}
            style={{ '--sw-dark': a.dark, '--sw-light': a.light } as React.CSSProperties}
          >
            <span className={styles.chip} aria-hidden />
            <span className={styles.name}>{a.name}</span>
            {a.flag && (
              <span className={styles.flag}>
                <TriangleAlert size={11} aria-hidden /> {a.flag}
              </span>
            )}
          </button>
        ))}
      </div>
    </>
  );
}
