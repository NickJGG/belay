import { notFound } from "next/navigation";
import { courseData } from "@/lib/course-data";
import { topicIndex } from "@/lib/courses";
import { listWork, readWork } from "@/lib/work";
import { WorkSpace } from "../work-editor";

const decode = (s: string) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** Work (grill Q29): a Workspace under the course header, Topo's file tree and editor. */
export default async function WorkTab({ params }: { params: Promise<{ c: string; path?: string[] }> }) {
  const { c, path } = await params;
  const course = await courseData(c);
  if (!course) notFound();
  const entries = listWork(c);

  let rel: string | null = null;
  let file: ReturnType<typeof readWork> = null;
  if (path?.length) {
    // Whether Next hands over segments decoded isn't documented; accept either.
    const candidates = [...new Set([path.join("/"), path.map(decode).join("/")])].map((p) => `work/${p}`);
    for (const r of candidates) {
      file = readWork(c, r);
      if (file) {
        rel = r;
        break;
      }
    }
    // A folder URL shows the bare tab.
    if (!file && !candidates.some((r) => entries.some((e) => e.dir && e.path === r))) notFound();
  }

  return <WorkSpace course={c} entries={entries} rel={rel} file={file} topics={topicIndex(course)} />;
}
