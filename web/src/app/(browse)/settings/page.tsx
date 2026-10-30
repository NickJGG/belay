import styles from "@/components/belay/belay.module.css";
import { PageHeader } from "@/components/layout/page-header";
import { Settings } from "@/components/settings/settings";
import { extensionStates } from "@/lib/data";
import { currentJob } from "@/lib/extension-job";
import { jobIdle } from "@/lib/settings";

export const metadata = { title: "Settings • Belay" };

export default async function SettingsPage() {
  const extensions = await extensionStates();
  const job = currentJob();
  return (
    <div className={styles.page}>
      <PageHeader title="Settings" />
      <Settings extensions={extensions} job={jobIdle(job) ? null : job} />
    </div>
  );
}
