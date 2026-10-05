import { Settings } from 'lucide-react';
import { PageBar } from '@/components/PageBar';
import ui from '@/components/ui.module.css';
import { ACCENTS, accent } from '@/lib/accents';
import { settings } from '@/lib/data';
import { SettingsForm } from './SettingsForm';

export const dynamic = 'force-dynamic';

export const metadata = { title: 'Settings' };

export default function SettingsPage() {
  const s = settings();
  return (
    <>
      <PageBar crumbs={[{ label: 'Settings', icon: <Settings size={14} aria-hidden /> }]} />
      <div className={ui.page}>
        <p className={ui.muted}>Saved to settings.yaml in the data dir.</p>
        <SettingsForm accents={ACCENTS} accent={accent(s.accent).key} theme={s.theme} />
      </div>
    </>
  );
}
