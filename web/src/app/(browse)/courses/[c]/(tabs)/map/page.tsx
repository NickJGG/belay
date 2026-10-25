import { notFound } from "next/navigation";
import belay from "@/components/belay/belay.module.css";
import { Prose } from "@/components/content/prose";
import styles from "@/components/course/course.module.css";
import { courseData } from "@/lib/course-data";
import { readCourseFile, splitTitle, topicIndex } from "@/lib/courses";
import { cn } from "@/lib/utils";

/** Map: map.md's Mermaid graph, topic nodes coloured by status. */
export default async function MapTab({ params }: { params: Promise<{ c: string }> }) {
  const { c } = await params;
  const course = await courseData(c);
  if (!course) notFound();
  const text = readCourseFile(c, "map.md");
  if (text === null) return <p className={belay.empty}>No map.md in this course.</p>;
  return (
    <div className={cn(styles.body, styles.wide)}>
      <Prose wide markdown={splitTitle(text).body} course={{ course: c, topics: topicIndex(course) }} />
    </div>
  );
}
