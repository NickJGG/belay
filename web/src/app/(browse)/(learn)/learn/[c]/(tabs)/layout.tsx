import { notFound } from "next/navigation";
import belay from "@/components/belay/belay.module.css";
import { CourseHead } from "@/app/(browse)/(learn)/_components/course-head";
import styles from "@/app/(browse)/(learn)/_components/course.module.css";
import { ShellSlot } from "@/components/layout/shell-slot";
import { courseData } from "@/app/(browse)/(learn)/_lib/course-data";
import { courseColor, courseDir } from "@/app/(browse)/(learn)/_lib/courses";
import { cn } from "@/lib/utils";

/** Every course tab's header and chips; the Work tab keeps them too, so they don't jump. */
export default async function CourseLayout({ children, params }: { children: React.ReactNode; params: Promise<{ c: string }> }) {
  const { c } = await params;
  const course = await courseData(c);
  if (!course) notFound();
  return (
    <div className={cn(belay.page, styles.coursePage)}>
      <ShellSlot owner={{ id: "learn", key: c, title: course.title }} glow={courseColor(course)} />
      <CourseHead
        course={c}
        title={course.title}
        color={courseColor(course)}
        dir={courseDir(c)!}
        next={course.next?.topic ?? null}
        due={course.cards.due}
        checkpoint={course.checkpoint?.due ? course.checkpoint.unit : null}
      />
      {children}
    </div>
  );
}
