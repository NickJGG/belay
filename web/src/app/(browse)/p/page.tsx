import { AppGrid, AppTile } from "@/components/app-tile";
import { projectsIndex, UNFILED, type ProjectTile } from "@/lib/data";
import styles from "../../page.module.css";

export const metadata = { title: "Projects — Belay" };

export default async function ProjectsPage() {
  const { projects, unfiled } = await projectsIndex();
  const working = projects.filter((p) => p.focus || p.open);
  const rest = projects.filter((p) => !p.focus && !p.open);
  const tile = (p: ProjectTile) => <AppTile key={p.key} project={p} href={`/p/${p.key}`} />;

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <h1 className={styles.title}>
          Projects <span className={styles.titleCount}>{projects.length}</span>
        </h1>
      </header>
      {working.length > 0 && (
        <section className={styles.section}>
          <h2 className={styles.trayTitle}>Working on</h2>
          <AppGrid>{working.map(tile)}</AppGrid>
        </section>
      )}
      <section className={styles.section}>
        <h2 className={styles.trayTitle}>Everything else</h2>
        <AppGrid>
          {rest.map(tile)}
          <AppTile project={unfiled} href={`/p/${UNFILED}`} />
        </AppGrid>
      </section>
    </div>
  );
}
