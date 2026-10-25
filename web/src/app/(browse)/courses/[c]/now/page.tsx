import Link from "next/link";
import { notFound } from "next/navigation";
import { Facts, None } from "@/components/belay/facts";
import { Prose } from "@/components/content/prose";
import styles from "@/components/course/course.module.css";
import { DetailHead } from "@/components/course/detail-head";
import { ShellSlot } from "@/components/layout/shell-slot";
import { courseData } from "@/lib/course-data";
import { courseColor, courseDir, fileMtime, readCourseFile, splitTitle, topicIndex } from "@/lib/courses";
import { navData } from "@/lib/data";
import { courseHref } from "@/lib/hrefs";

type Props = { params: Promise<{ c: string }> };

/** `14:05` today, else `25 Oct, 14:05`. */
function boardTime(d: Date) {
  const time = d.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
  return d.toDateString() === new Date().toDateString() ? time : `${d.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}, ${time}`;
}

/** The knowledge topic a lesson's title (`Lesson · <topic>`) names, if the course has it. */
const topicOf = (title: string | undefined, known: Set<string>) => {
  const t = title?.replace(/^Lesson · /, "");
  return t && known.has(t) ? t : null;
};

async function liveTitle(c: string) {
  return (await navData()).live.find((l) => l.kind === "lesson" && l.course === c)?.topic;
}

export async function generateMetadata({ params }: Props) {
  const { c } = await params;
  const course = await courseData(c);
  return { title: `${(await liveTitle(c)) ?? "Whiteboard"} · ${course?.title ?? c} • Belay` };
}

/**
 * The lesson's workspace, the grill page's counterpart, where a lesson's Tab lands: the header titled with
 * the live lesson, a facts table (Course · Topic · Board updated), then now.md's board. Follow along leaves it for
 * claims, sources and work.
 */
export default async function NowPage({ params }: Props) {
  const { c } = await params;
  const course = await courseData(c);
  if (!course) notFound();
  const live = await liveTitle(c);
  const title = live ?? "Whiteboard";
  const topic = topicOf(live, course.knowledge) ?? course.next?.topic ?? null;
  const text = readCourseFile(c, "now.md");
  const mtime = fileMtime(c, "now.md");
  const dir = courseDir(c);
  return (
    <div className={styles.coursePage}>
      <ShellSlot course={{ slug: c, title: course.title }} />
      <DetailHead
        title={title}
        back={{ href: courseHref(c), label: course.title }}
        color={courseColor(course)}
        seed={c}
        file={text === null || !dir ? null : `${dir}/now.md`}
      />
      <Facts
        facts={[
          ["Course", <Link key="c" href={courseHref(c)}>{course.title}</Link>],
          ["Topic", topic && course.knowledge.has(topic) ? <Link key="t" href={courseHref(c, `/knowledge/${topic}`)}>{topic}</Link> : topic ?? <None />],
          ["Board", mtime ? `updated ${boardTime(mtime)}` : <None />],
        ]}
      />
      <div className={styles.kbody}>
        {text === null ? (
          <p className={styles.empty}>Nothing on the board yet. Claude writes notation and diagrams to now.md during a lesson.</p>
        ) : (
          <Prose markdown={splitTitle(text).body} course={{ course: c, topics: topicIndex(course) }} wide />
        )}
      </div>
    </div>
  );
}
