"use client";

import { ProjectMark } from "@/components/project-mark";
import { str } from "@/components/session/drawer";
import styles from "@/components/session/session.module.css";
import type { ClientKind } from "@/lib/session-kind";
import type { ClientSlots } from "@/lib/slots";
import info from "../../belay.json";
import type { ReviewSearch } from "../_lib/manifest.server";
import type { ReviewLive } from "../_lib/runtime.server";
import { ReviewIcon, ReviewMark } from "./mark";
import { ReviewsFound } from "./palette";

const nums = (n: unknown) => (Array.isArray(n) ? n : [n]).map((x) => `#${String(x)}`).join(", ");

const DID: Record<string, (e: Record<string, unknown>) => string> = {
  decide: (e) => (e.decision === "clear" ? `You cleared ${nums(e.n)}` : `You queued ${nums(e.n)} to ${str(e.decision)}`),
  track: (e) => `You tracked ${nums(e.n)}${str(e.issue) ? ` as ${str(e.issue)}` : ""}`,
  ask: (e) => `You asked about ${nums(e.n)}`,
  investigate: (e) => `You asked to investigate ${nums(e.n)}`,
  tests: (e) => `You asked for a test for ${nums(e.n)}`,
  apply: () => "You asked to apply the queued fixes",
  rerun: () => "You asked to re-run the review",
  stop: () => "You asked to stop the review",
};

/** A review's own files; chat and pictures are the Drawer's. */
const REVIEW_FILES = /^(review|findings|decisions|checking|coverage)\.json$/;

export const client: ClientKind<ReviewLive> = {
  id: "review",
  kind: "review",
  title: (s) => s.topic,
  place: (s) => s.mark?.name ?? "Unfiled",
  mark: (s) => <ProjectMark mark={s.mark} />,
  entry: (e) => {
    const did = e.from === "site" ? DID[str(e.kind)] : undefined;
    return did ? <div className={styles.event}>{did(e)}</div> : undefined;
  },
  banner: (link, id) =>
    link.state === "disconnected" ? (
      <>
        Disconnected: run <code>/review:review resume {id}</code> in the terminal.
      </>
    ) : (
      <>
        No terminal attached. Run <code>/review:review resume {id}</code> in a session started with <code>belay claude</code> to steer it from here.
      </>
    ),
  refresh: (e) => e.type === "file" && e.slug.startsWith("review-") && REVIEW_FILES.test(e.name),
};

export const slots: ClientSlots<ReviewSearch> = {
  id: "review",
  name: info.name,
  summary: info.summary,
  Mark: ReviewMark,
  sectionIcons: { Reviews: ReviewIcon },
  Found: ReviewsFound,
};
