"use client";

import type * as React from "react";
import { Command } from "cmdk";
import { BookOpen, CircleAlert, FileText, GraduationCap } from "lucide-react";
import { Mark } from "@/components/layout/logo";
import styles from "@/components/layout/palette.module.css";
import { shortDate } from "@/lib/format";
import { courseHref } from "@/app/(browse)/(learn)/_lib/hrefs";
import type { PaletteProps } from "@/lib/slots";
import type { LearnSearch } from "../_lib/manifest.server";

const CourseMark = ({ color }: { color: string }) => (
  <span style={{ "--hue": color } as React.CSSProperties}>
    <Mark tone="current" className={styles.courseMark} />
  </span>
);

/** The palette's courses, listed before there's a query. */
export function CoursesBrowse({ index, go }: PaletteProps<LearnSearch>) {
  if (!index.courses.length) return null;
  return (
    <Command.Group heading="Courses" className={styles.group}>
      {index.courses.map((c) => (
        <Command.Item key={c.course} value={`course ${c.course} ${c.title}`} className={styles.hit} onSelect={go(courseHref(c.course))}>
          <CourseMark color={c.color} />
          <b>{c.title}</b>
          <em>{c.course}</em>
        </Command.Item>
      ))}
    </Command.Group>
  );
}

/** Every course's lessons, notes, sources and misconceptions, once there's a query. */
export function CoursesFound({ index, go }: PaletteProps<LearnSearch>) {
  return (
    <>
      <Command.Group heading="Lessons" className={styles.group}>
        {index.lessons.map((l) => (
          <Command.Item
            key={`${l.course}/${l.slug}`}
            value={`lesson ${l.course} ${l.slug} ${l.title}`}
            className={styles.hit}
            onSelect={go(courseHref(l.course, `/lessons/${l.slug}`))}
          >
            <GraduationCap size={14} aria-hidden />
            <b>{l.title}</b>
            <em>{`${l.courseTitle} · ${shortDate(l.date)}`}</em>
          </Command.Item>
        ))}
      </Command.Group>
      <Command.Group heading="Notes" className={styles.group}>
        {index.notes.map((n) => (
          <Command.Item
            key={`${n.course}/${n.slug}`}
            value={`note ${n.course} ${n.slug} ${n.title}`}
            className={styles.hit}
            onSelect={go(courseHref(n.course, `/knowledge/${n.slug}`))}
          >
            <FileText size={14} aria-hidden />
            <b>{n.title}</b>
            <em>{n.slug}</em>
          </Command.Item>
        ))}
      </Command.Group>
      <Command.Group heading="Sources" className={styles.group}>
        {index.sources.map((s) => (
          <Command.Item
            key={`${s.course}/${s.id}`}
            value={`source ${s.course} ${s.id} ${s.title}`}
            className={styles.hit}
            onSelect={go(courseHref(s.course, `/sources/${s.id}`))}
          >
            <BookOpen size={14} aria-hidden />
            <b>{s.title}</b>
            <em>{s.id}</em>
          </Command.Item>
        ))}
      </Command.Group>
      <Command.Group heading="Misconceptions" className={styles.group}>
        {index.misconceptions.map((m, i) => (
          <Command.Item
            key={`${m.course}/${i}`}
            value={`misconception ${m.course} ${m.topic} ${m.topicTitle} ${m.claim}`}
            className={styles.hit}
            onSelect={go(courseHref(m.course, "/misconceptions"))}
          >
            <CircleAlert size={14} aria-hidden />
            <b>{m.claim}</b>
            <em>{m.topicTitle}</em>
          </Command.Item>
        ))}
      </Command.Group>
    </>
  );
}
