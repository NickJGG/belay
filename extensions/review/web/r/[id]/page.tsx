import { notFound } from "next/navigation";
import { reviewDetail } from "../../_lib/detail.server";
import { ReviewWorkspace } from "../../_components/workspace";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return { title: `${id} • Belay` };
}

/** A saved review's Workspace: its Overview, one finding (`#f-<n>`), or its progress while it runs. */
export default async function ReviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const d = await reviewDetail(id);
  if (!d) notFound();
  return <ReviewWorkspace d={d} />;
}
