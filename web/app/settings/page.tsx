import ui from '@/components/ui.module.css';
import { ACCENTS, accent } from '@/lib/accents';
import { settings } from '@/lib/data';
import { SettingsForm } from './SettingsForm';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Settings' };

export default function SettingsPage() {
  const s = settings();
  return (
    <div className={ui.page}>
      <header className={ui.header}>
        <h1 className={ui.title}>Settings</h1>
      </header>
      <p className={ui.muted}>Saved to settings.yaml in the data dir.</p>
      <SettingsForm accents={ACCENTS} accent={accent(s.accent).key} theme={s.theme} />
    </div>
  );
}
