import styles from "@/components/belay/belay.module.css";
import { PageHeader } from "@/components/layout/page-header";
import { Settings } from "@/components/settings/settings";
import { extensionStates } from "@/lib/data";

export const metadata = { title: "Settings • Belay" };

export default async function SettingsPage() {
  return (
    <div className={styles.page}>
      <PageHeader title="Settings" />
      <Settings extensions={await extensionStates()} />
    </div>
  );
}
