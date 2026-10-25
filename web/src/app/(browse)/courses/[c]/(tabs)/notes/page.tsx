import Link from "next/link";
import { notFound } from "next/navigation";
import { Group } from "@/components/belay/group";
import belay from "@/components/belay/belay.module.css";
import styles from "@/components/course/course.module.css";
import { courseData } from "@/lib/course-data";
import { listKnowledge, listSources } from "@/lib/courses";
import { courseHref } from "@/lib/hrefs";
import { cn } from "@/lib/utils";

function Row({ href, title, id, backbone }: { href: string; title: string; id: string; backbone?: boolean }) {
  return (
    <li className={belay.row}>
      <Link href={href} className={cn(belay.grow, belay.stretch)}>
        {title}
      </Link>
      {backbone ? <span className={styles.faint}>backbone</span> : null}
      <code className={styles.nid}>{id}</code>
    </li>
  );
}

/** Notes: Knowledge open and Sources collapsed, backbone sources first; each row the title, then its id. */
export default async function NotesTab({ params }: { params: Promise<{ c: string }> }) {
  const { c } = await params;
  if (!(await courseData(c))) notFound();
  const knowledge = listKnowledge(c);
  const sources = listSources(c).sort((a, b) => Number(b.role === "backbone") - Number(a.role === "backbone"));
  return (
    <div className={cn(styles.body, styles.notes)}>
      <Group id={`${c}:notes:knowledge`} label="Knowledge" count={knowledge.length} headClassName={styles.unitHead}>
        {knowledge.length ? (
          <ul className={belay.rows}>
            {knowledge.map((k) => (
              <Row key={k.slug} href={courseHref(c, `/knowledge/${k.slug}`)} title={k.title} id={k.slug} />
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>No knowledge notes yet.</p>
        )}
      </Group>
      <Group id={`${c}:notes:sources`} label="Sources" count={sources.length} defaultOpen={false} headClassName={styles.unitHead}>
        {sources.length ? (
          <ul className={belay.rows}>
            {sources.map((s) => (
              <Row key={s.id} href={courseHref(c, `/sources/${s.id}`)} title={s.title} id={s.id} backbone={s.role === "backbone"} />
            ))}
          </ul>
        ) : (
          <p className={styles.empty}>No sources yet.</p>
        )}
      </Group>
    </div>
  );
}
