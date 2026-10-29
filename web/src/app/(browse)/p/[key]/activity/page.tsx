import { notFound } from "next/navigation";
import { Activity } from "@/components/belay/activity";
import { projectActivity } from "@/lib/data";
import { WEEK, windowDays } from "@/lib/belay-view";
import { activeIds } from "@/lib/extensions.server";
import { projectHref } from "@/lib/hrefs";
import { pseudoProject } from "@/lib/sidebar";

type Props = { params: Promise<{ key: string }>; searchParams: Promise<{ days?: string }> };

export async function generateMetadata({ params }: Props) {
  return { title: `${decodeURIComponent((await params).key).toUpperCase()} activity • Belay` };
}

/** A project's Activity: issue moves and log entries by work day, a week at first and a week more per Show earlier. */
export default async function ProjectActivity({ params, searchParams }: Props) {
  const raw = decodeURIComponent((await params).key);
  if (pseudoProject(raw, activeIds())) notFound();
  const key = raw.toUpperCase();
  const days = windowDays((await searchParams).days);
  const { today, feed } = await projectActivity(key, days);
  return <Activity feed={feed} today={today} scope={key} earlierHref={projectHref(key, `/activity?days=${days + WEEK}`)} />;
}
