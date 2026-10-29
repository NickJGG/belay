"use client";

import * as React from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { useLesson } from "./lesson-state";
import { toast, toastError } from "@/components/belay/toaster";
import { useLive } from "@/components/live/live-provider";
import { Button } from "@/components/ui/button";
import { Popover } from "@/components/ui/popover";
import type { LiveItem } from "@/lib/data";
import { isLesson } from "../_lib/lesson";
import type { Routine } from "../_lib/routines";
import { cn } from "@/lib/utils";
import styles from "./start-buttons.module.css";

/** Copies `command` and says where to run it; shows it instead when the clipboard is refused. */
export async function copyCommand(command: string, where: string) {
  try {
    await navigator.clipboard.writeText(command);
    toast(`Copied ${command}. Run it in ${where}.`);
  } catch {
    toast(`Run ${command} in ${where}.`);
  }
}

/**
 * Queues the routine for a fresh session (`/api/lesson/start`). A live lesson is asked to restart into it (wrapping
 * up first if `wrap`); with none, `belay learn` in a terminal picks it up.
 */
export async function startRoutine(course: string, routine: Routine, wrap = false) {
  try {
    const r = await fetch("/api/lesson/start", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course, routine, wrap }),
    });
    const j = (await r.json().catch(() => ({}))) as { live?: boolean; error?: string; queued?: { label: string } };
    if (!r.ok) return toastError(j.error ?? `Couldn't start (${r.status})`);
    if (j.live) return toast(`${j.queued?.label ?? "The routine"} starts once Claude restarts.`);
    if (j.error) toastError(`The live lesson didn't answer (${j.error}). It's queued for the next one.`);
    await copyCommand("belay learn", "a terminal to start it");
  } catch (err) {
    toastError((err as Error).message);
  }
}

const cancelStart = () => void fetch("/api/lesson/start", { method: "DELETE" }).catch(() => {});

/** The live lesson, if any: there is at most one in practice, since a start restarts the last. */
export const liveLesson = (live: LiveItem[]) => live.find(isLesson) ?? null;

/**
 * Starts `routine` in a fresh session (`startRoutine`). While that start waits it shows where it stands, with Cancel;
 * while a lesson is live, a popover offers to wrap it up first. `resume` makes it open the course's live lesson instead.
 */
export function StartButton({
  course,
  routine,
  label,
  className,
  resume = false,
}: {
  course: string;
  routine: Routine;
  label: React.ReactNode;
  className: string;
  resume?: boolean;
}) {
  const { live } = useLive();
  const { start } = useLesson();
  const [asking, setAsking] = React.useState(false);
  const [sending, setSending] = React.useState(false);
  const close = React.useCallback(() => setAsking(false), []);
  const lesson = liveLesson(live);

  if (resume && lesson?.course === course) {
    return (
      <Link href={lesson.href} className={className}>
        Resume
      </Link>
    );
  }

  if (start && start.course === course && start.routine === routine) {
    return (
      <span className={cn(className, styles.pending)} role="status">
        {lesson ? (
          "Restarting…"
        ) : (
          <>
            Queued · run <code>belay learn</code>
          </>
        )}
        <button type="button" className={styles.cancel} onClick={cancelStart} aria-label="Cancel the start">
          <X size={16} aria-hidden />
        </button>
      </span>
    );
  }

  const go = async (wrap = false) => {
    setAsking(false);
    setSending(true);
    await startRoutine(course, routine, wrap);
    setSending(false);
  };

  const button = (
    <button
      type="button"
      className={cn(className, styles.button)}
      disabled={sending}
      aria-expanded={lesson ? asking : undefined}
      onClick={() => (lesson ? setAsking(!asking) : void go())}
    >
      {label}
    </button>
  );
  if (!lesson) return button;
  return (
    <Popover open={asking} onClose={close} trigger={button} label="Wrap up the live lesson first?">
      <p className={styles.title}>Wrap up the live lesson first?</p>
      <p className={styles.body}>
        {lesson.topic} on {lesson.course} is still live, so its cards, misconceptions and log aren&apos;t saved yet.
      </p>
      <div className={styles.row}>
        <Button size="sm" onClick={() => void go(true)}>
          Wrap up first
        </Button>
        <Button size="sm" variant="outline" onClick={() => void go()}>
          Start anyway
        </Button>
        <Button size="sm" variant="ghost" onClick={close}>
          Cancel
        </Button>
      </div>
    </Popover>
  );
}

export type StartOption = { routine: Routine; label: string; primary: boolean };

/** The course header's routines, each left out when it doesn't apply. */
export function startOptions({ lesson, due, checkpoint }: { lesson: boolean; due: number; checkpoint: number | null }): StartOption[] {
  const out: StartOption[] = [];
  if (lesson) out.push({ routine: "lesson", label: "Start lesson", primary: true });
  out.push({ routine: "quick", label: "Quick review", primary: !lesson });
  if (due > 0) out.push({ routine: "review", label: `Review ${due} card${due === 1 ? "" : "s"}`, primary: false });
  if (checkpoint !== null) out.push({ routine: "checkpoint", label: `Checkpoint ${checkpoint}`, primary: false });
  return out;
}
