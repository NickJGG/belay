import { notFound } from "next/navigation";
import styles from "@/components/belay/belay.module.css";
import { ProjectHead } from "@/components/belay/project-head";
import { ShellSlot } from "@/components/layout/shell-slot";
import { projectColor } from "@/components/project-mark";
import { projectHead } from "@/lib/data";
import { shellRules } from "@/lib/extensions";
import { activeIds } from "@/lib/extensions.server";

/** Every project section's header and chips; an active extension's pseudo-project (Unfiled) gets no actions. */
export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ key: string }> }) {
  const key = decodeURIComponent((await params).key);
  const pseudo = shellRules(activeIds()).find((r) => r.pseudo?.key === key)?.pseudo;
  if (pseudo) {
    return (
      <div className={styles.page}>
        <ShellSlot project={pseudo} />
        <ProjectHead project={{ ...pseudo, status: "active", focus: false }} mark={null} />
        {children}
      </div>
    );
  }
  const head = await projectHead(key);
  if (!head) notFound();
  const { project } = head;
  return (
    <div className={styles.page}>
      <ShellSlot project={{ key: project.key, name: project.name }} glow={projectColor(project)} />
      <ProjectHead project={project} mark={head.mark} prev={head.prev} next={head.next} />
      {children}
    </div>
  );
}
