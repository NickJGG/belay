import { GrillList, type GrillItem } from "./grill-list";
import { grillProgress, type Stage } from "../_lib/issues";
import { projectStages, type WorkItem } from "../_lib/projects.server";

const row = (s: WorkItem): GrillItem => ({
  slug: s.slug,
  topic: s.topic,
  updated: s.updated,
  live: s.live,
  working: s.working,
  progress: grillProgress(s),
});

/** A project's Grills section, or Unfiled's. */
export async function ProjectGrills({ projectKey }: { projectKey: string }) {
  const stages = await projectStages(projectKey);
  return <GrillList stages={Object.fromEntries(Object.entries(stages).map(([st, list]) => [st, list.map(row)])) as Record<Stage, GrillItem[]>} />;
}
