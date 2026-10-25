import { notFound } from "next/navigation";
import { ShellSlot } from "@/components/layout/shell-slot";
import { ProjectMark } from "@/components/project-mark";
import { StageTabs } from "@/components/session/stage-tabs";
import { projectData, UNFILED } from "@/lib/data";
import styles from "../../../page.module.css";

export async function generateMetadata({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  return { title: `${key === UNFILED ? "Unfiled" : key.toUpperCase()} — Belay` };
}

export default async function ProjectPage({ params }: { params: Promise<{ key: string }> }) {
  const { key } = await params;
  const data = await projectData(key);
  if (!data) notFound();
  const matched = data.sessions.filter((s) => !data.tagged.has(s.slug)).map((s) => s.slug);
  const n = data.sessions.length;

  return (
    <div className={styles.page}>
      <ShellSlot project={{ key: data.key, name: data.name }} />
      <header className={styles.header}>
        <h1 className={styles.title}>
          <ProjectMark mark={data.mark} className={styles.titleMark} />
          {data.name}
        </h1>
        <p className={styles.meta}>
          {[data.key === UNFILED ? null : data.key, data.group, n === 1 ? "1 session" : `${n} sessions`]
            .filter(Boolean)
            .join(" · ")}
        </p>
      </header>
      {n ? (
        <StageTabs stages={data.stages} matched={data.key === UNFILED ? undefined : matched} />
      ) : (
        <p className={styles.empty}>No sessions for this project yet.</p>
      )}
    </div>
  );
}
