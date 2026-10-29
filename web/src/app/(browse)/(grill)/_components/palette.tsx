"use client";

import { Command } from "cmdk";
import styles from "@/components/layout/palette.module.css";
import { ProjectMark } from "@/components/project-mark";
import { grillHref } from "../_lib/hrefs";
import type { PaletteProps } from "@/lib/slots";
import type { GrillSearch } from "../_lib/manifest.server";

/** The palette's grills, legacy ones too, once there's a query. */
export function GrillsFound({ index, go }: PaletteProps<GrillSearch>) {
  return (
    <Command.Group heading="Grills" className={styles.group}>
      {index.sessions.map((s) => (
        <Command.Item key={s.slug} value={`grill ${s.slug} ${s.topic}`} className={styles.hit} onSelect={go(grillHref(s.slug))}>
          <ProjectMark mark={s.project} />
          <b>{s.topic}</b>
          <em>{[s.slug, s.stage].join(" · ")}</em>
        </Command.Item>
      ))}
    </Command.Group>
  );
}
