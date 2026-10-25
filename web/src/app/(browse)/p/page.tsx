import { Group } from "@/components/belay/group";
import { ProjectCard, ProjectCards } from "@/components/belay/project-card";
import styles from "@/components/belay/belay.module.css";
import { PageHeader } from "@/components/layout/page-header";
import { projectGroups } from "@/lib/belay-view";
import { projectsIndex, type ProjectCard as Card } from "@/lib/data";
import { UNFILED } from "@/lib/hrefs";
import page from "../../page.module.css";

export const metadata = { title: "Projects — Belay" };

const card = (p: Card) => (
  <ProjectCard
    key={p.key}
    projectKey={p.key}
    name={p.name}
    mark={p.mark}
    facts={[p.key, p.group, p.open ? `${p.open} open` : null, p.status !== "active" ? p.status : null].filter(Boolean).join(" · ")}
  />
);

/**
 * Projects: the list header, then a card per project under Working on (focus or open work)
 * and Everything else, with paused and archived ones in a collapsed group at the foot.
 */
export default async function ProjectsPage() {
  const { projects, unfiled } = await projectsIndex();
  const { working, rest, shelved } = projectGroups(projects);
  return (
    <div className={styles.page}>
      <PageHeader title="Projects" count={working.length + rest.length} />
      <div className={page.page}>
        {working.length > 0 && (
          <section className={page.section}>
            <h2 className={page.trayTitle}>Working on</h2>
            <ProjectCards>{working.map(card)}</ProjectCards>
          </section>
        )}
        <section className={page.section}>
          <h2 className={page.trayTitle}>Everything else</h2>
          <ProjectCards>
            {rest.map(card)}
            {unfiled > 0 ? <ProjectCard projectKey={UNFILED} name="Unfiled" mark={null} facts={unfiled === 1 ? "1 grill" : `${unfiled} grills`} /> : null}
          </ProjectCards>
        </section>
        {shelved.length > 0 && (
          <Group id="projects:shelved" label="Paused and archived" count={shelved.length} defaultOpen={false} dim>
            <ProjectCards>{shelved.map(card)}</ProjectCards>
          </Group>
        )}
      </div>
    </div>
  );
}
