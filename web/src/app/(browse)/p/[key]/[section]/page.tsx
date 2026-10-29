import { notFound } from "next/navigation";
import { projectSection } from "@/lib/extensions.server";

type Props = { params: Promise<{ key: string; section: string }> };

/** The active extension's section at this address; Not found when none has it. */
async function find(params: Props["params"]) {
  const p = await params;
  const key = decodeURIComponent(p.key);
  const section = await projectSection(key, decodeURIComponent(p.section));
  if (!section) notFound();
  return { key, ...section };
}

export async function generateMetadata({ params }: Props) {
  const { key, label } = await find(params);
  return { title: `${key.toUpperCase()} ${label.toLowerCase()} • Belay` };
}

/** A project section an extension adds (a project's Grills), under the project's layout. */
export default async function ProjectSection({ params }: Props) {
  const { key, Section } = await find(params);
  return <Section projectKey={key} />;
}
