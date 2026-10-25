import Link from "next/link";
import { notFound } from "next/navigation";
import belay from "@/components/belay/belay.module.css";
import { Facts, None } from "@/components/belay/facts";
import { Prose } from "@/components/content/prose";
import styles from "@/components/course/course.module.css";
import { DetailHead } from "@/components/course/detail-head";
import { ShellSlot } from "@/components/layout/shell-slot";
import { courseData, sourceDetail } from "@/lib/course-data";
import { courseColor } from "@/lib/courses";
import { courseHref } from "@/lib/hrefs";

type Props = { params: Promise<{ c: string; id: string }> };

export async function generateMetadata({ params }: Props) {
  const { c, id } = await params;
  const course = await courseData(c);
  return { title: `${(course && sourceDetail(course, id)?.title) ?? id} — Belay` };
}

/** `https://github.com/stanford-cs336/…` without its scheme, for the Link fact. */
const shortUrl = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "");

/**
 * A source (grill Q32), in the knowledge note's layout: a facts table (Role · Accessed · Licence / Link · Id · Cited
 * by), then the excerpt. Cited by counts the citing claims and links the topics they're in.
 */
export default async function SourcePage({ params }: Props) {
  const { c, id } = await params;
  const course = await courseData(c);
  const d = course && sourceDetail(course, id);
  if (!course || !d) notFound();
  const { url, role, accessed, licence } = d.meta;
  const { claims, topics } = d.citedBy;
  return (
    <div className={belay.page}>
      <ShellSlot course={{ slug: c, title: course.title }} section="Notes" detail={{ label: id, href: courseHref(c, `/sources/${id}`) }} />
      <DetailHead title={d.title} back={{ href: courseHref(c, "/notes"), label: "Notes" }} color={courseColor(course)} seed={c} file={d.abs} />
      <Facts
        facts={[
          ["Role", role || <None />],
          ["Accessed", accessed || <None />],
          ["Licence", licence || <None />],
          [
            "Link",
            url && /^https?:\/\//.test(url) ? (
              <a href={url} target="_blank" rel="noreferrer" title={url} className={belay.grow}>
                {shortUrl(url)} ↗
              </a>
            ) : (
              url || <None />
            ),
          ],
          ["Id", <code key="id">{id}</code>],
          [
            "Cited by",
            claims ? (
              <>
                {claims} claim{claims === 1 ? "" : "s"} ·
                {topics.map((t) => (
                  <Link key={t} href={courseHref(c, `/knowledge/${t}`)}>
                    {t}
                  </Link>
                ))}
              </>
            ) : (
              <None />
            ),
          ],
        ]}
      />
      <div className={styles.kbody}>
        <Prose markdown={d.body} course={{ course: c }} />
      </div>
    </div>
  );
}
