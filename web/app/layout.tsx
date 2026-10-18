import type { Metadata } from 'next';
import { KeysProvider } from '@/components/Keys';
import { LiveSync } from '@/components/LiveSync';
import type { PaletteData } from '@/components/Palette';
import { Sidebar } from '@/components/Sidebar';
import { Toaster } from '@/components/Toaster';
import { accent } from '@/lib/accents';
import { ctx, plural, settings, workDay } from '@/lib/data';
import './tokens.css';
import styles from './layout.module.css';

export const dynamic = 'force-dynamic';

export function generateMetadata(): Metadata {
  return {
    title: { template: '%s · Belay', default: 'Belay' },
    icons: { icon: { url: `/favicon?a=${accent(settings().accent).key}`, type: 'image/svg+xml' } },
  };
}

/** Theme and accent are set on <html> here, on the server, so the first paint is already right. */
export default function RootLayout({ children }: { children: React.ReactNode }) {
  const s = settings();
  const a = accent(s.accent);
  const style = { '--accent-dark': a.dark, '--accent-light': a.light } as React.CSSProperties;
  const { projects, issues, bad } = ctx();
  const palette: PaletteData = {
    projects: projects.map((p) => ({ key: p.key, name: p.name, status: p.status, focus: p.focus, group: p.group, kinds: p.kinds })),
    issues: issues.map((t) => ({ id: t.id, title: t.title, status: t.status, project: t.project, high: t.priority === 'high' })),
    day: workDay(),
  };
  return (
    <html lang="en" data-theme={s.theme === 'system' ? undefined : s.theme} style={style}>
      <body>
        <KeysProvider data={palette}>
          <div className={styles.shell}>
            <Sidebar />
            <main className={styles.main}>
              {bad.length > 0 && (
                <div className={styles.bad} role="alert">
                  <strong>
                    Skipped {plural(bad.length, 'bad file')}; saving is off until {bad.length === 1 ? 'it is' : 'they are'} fixed.
                  </strong>
                  <ul>
                    {bad.map((b) => (
                      <li key={b.file}>
                        <code>{b.file}</code> {b.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {children}
            </main>
          </div>
        </KeysProvider>
        <Toaster />
        <LiveSync />
      </body>
    </html>
  );
}
