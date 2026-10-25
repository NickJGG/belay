import { GrillList, type GrillItem } from "@/components/belay/grill-list";
import { grillProgress } from "@/lib/belay-view";
import { projectData, type WorkItem } from "@/lib/data";
import { STAGES, type Stage } from "@/lib/issues";

type Props = { params: Promise<{ key: string }> };

export async function generateMetadata({ params }: Props) {
  return { title: `${decodeURIComponent((await params).key).toUpperCase()} grills • Belay` };
}

const row = (s: WorkItem): GrillItem => ({
  slug: s.slug,
  topic: s.topic,
  updated: s.updated,
  live: s.live,
  working: s.working,
  progress: grillProgress(s),
});

/** A project's Grills; an archived project with none has no node, so an empty list. */
export default async function ProjectGrills({ params }: Props) {
  const data = await projectData(decodeURIComponent((await params).key));
  const stages = Object.fromEntries(STAGES.map((st) => [st, (data?.stages[st] ?? []).map(row)])) as Record<Stage, GrillItem[]>;
  return <GrillList stages={stages} />;
}
