import { notFound } from "next/navigation";
import { Group } from "@/components/belay/group";
import { Prose } from "@/components/content/prose";
import styles from "@/app/(browse)/(learn)/_components/course.module.css";
import { courseData, misconceptionGroups, type MisconceptionItem } from "@/app/(browse)/(learn)/_lib/course-data";
import { topicTitle } from "@/app/(browse)/(learn)/_lib/courses";
import { cn } from "@/lib/utils";

function Items({ course, items }: { course: string; items: MisconceptionItem[] }) {
  return (
    <ul className={styles.misc}>
      {items.map((m, i) => (
        <li key={i}>
          <Prose compact className={styles.inline} markdown={m.date ? `${m.date} · ${m.claim}` : m.claim} context={{ id: "learn", course }} />
          {m.correction ? <Prose compact className={cn(styles.inline, styles.correction)} markdown={m.correction} context={{ id: "learn", course }} /> : null}
        </li>
      ))}
    </ul>
  );
}

/**
 * Misconceptions: yours first, then "Known in the field" with a group per topic, the topic in progress
 * open. Each item is the claim with its correction muted under it.
 */
export default async function MisconceptionsTab({ params }: { params: Promise<{ c: string }> }) {
  const { c } = await params;
  const course = await courseData(c);
  if (!course) notFound();
  const { mine, field } = misconceptionGroups(course);
  const total = field.reduce((n, g) => n + g.items.length, 0);
  return (
    <div className={cn(styles.body, styles.notes)}>
      <Group id={`${c}:misc:mine`} label="Yours" count={mine.length} headClassName={styles.unitHead}>
        {mine.length ? <Items course={c} items={mine} /> : <p className={styles.empty}>None yet. Sessions add the ones you actually make.</p>}
      </Group>
      <h3 className={styles.subhead}>
        Known in the field <span>{total}</span>
      </h3>
      {field.length ? (
        field.map((g) => (
          <Group
            key={g.topic}
            id={`${c}:misc:${g.topic || "other"}`}
            label={g.topic ? topicTitle(course, g.topic) : "Other"}
            count={g.items.length}
            defaultOpen={g.topic === course.next?.topic}
            headClassName={styles.unitHead}
          >
            <Items course={c} items={g.items} />
          </Group>
        ))
      ) : (
        <p className={styles.empty}>None recorded.</p>
      )}
    </div>
  );
}
