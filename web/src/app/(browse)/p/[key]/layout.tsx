import { notFound } from "next/navigation";
import styles from "@/components/belay/belay.module.css";
import { ProjectHead } from "@/components/belay/project-head";
import { ShellSlot } from "@/components/layout/shell-slot";
import { projectHead } from "@/lib/data";
import { UNFILED } from "@/lib/hrefs";

/** Every project section's header and chips; Unfiled, which only gathers grills, gets no actions. */
export default async function ProjectLayout({ children, params }: { children: React.ReactNode; params: Promise<{ key: string }> }) {
  const key = decodeURIComponent((await params).key);
  if (key === UNFILED) {
    return (
      <div className={styles.page}>
        <ShellSlot project={{ key: UNFILED, name: "Unfiled" }} />
        <ProjectHead project={{ key: UNFILED, name: "Unfiled", status: "active", focus: false }} mark={null} />
        {children}
      </div>
    );
  }
  const head = await projectHead(key);
  if (!head) notFound();
  const { project } = head;
  return (
    <div className={styles.page}>
      <ShellSlot project={{ key: project.key, name: project.name }} />
      <ProjectHead project={project} mark={head.mark} prev={head.prev} next={head.next} />
      {children}
    </div>
  );
}
