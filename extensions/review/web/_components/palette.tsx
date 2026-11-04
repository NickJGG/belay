"use client";

import { Command } from "cmdk";
import styles from "@/components/layout/palette.module.css";
import { ProjectMark } from "@/components/project-mark";
import { reviewHref } from "../_lib/hrefs";
import type { PaletteProps } from "@/lib/slots";
import type { ReviewSearch } from "../_lib/manifest.server";

const STATE = { running: "running", "needs-you": "needs you", done: "done" } as const;

/** The palette's reviews, once there's a query. */
export function ReviewsFound({ index, go }: PaletteProps<ReviewSearch>) {
  return (
    <Command.Group heading="Reviews" className={styles.group}>
      {index.reviews.map((r) => (
        <Command.Item key={r.id} value={`review ${r.id} ${r.title} ${r.ref ?? ""}`} className={styles.hit} onSelect={go(reviewHref(r.id))}>
          <ProjectMark mark={r.project} />
          <b>{r.title}</b>
          <em>{[r.ref, STATE[r.state]].filter(Boolean).join(" · ")}</em>
        </Command.Item>
      ))}
    </Command.Group>
  );
}
