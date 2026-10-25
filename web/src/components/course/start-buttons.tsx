"use client";

import * as React from "react";
import { toast } from "@/components/belay/toaster";
import { routineCommand, type Routine } from "@/lib/routines";

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
 * Copies the routine's command (`/learn <course>` and the like) to run in a terminal. Starting it in a fresh session
 * from here waits for lessons to attach through the one bridge.
 */
export function StartButton({
  course,
  routine,
  label,
  className,
}: {
  course: string;
  routine: Routine;
  label: React.ReactNode;
  className: string;
}) {
  const { command } = routineCommand(routine, course);
  return (
    <button type="button" className={className} title={`Copy ${command}`} onClick={() => void copyCommand(command, "a Claude session in ~/Learning")}>
      {label}
    </button>
  );
}

export type StartOption = { routine: Routine; label: string; primary: boolean };

/** The course header's routines (grill Q16), each left out when it doesn't apply. */
export function startOptions({ lesson, due, checkpoint }: { lesson: boolean; due: number; checkpoint: number | null }): StartOption[] {
  const out: StartOption[] = [];
  if (lesson) out.push({ routine: "lesson", label: "Start lesson", primary: true });
  out.push({ routine: "quick", label: "Quick review", primary: !lesson });
  if (due > 0) out.push({ routine: "review", label: `Review ${due} card${due === 1 ? "" : "s"}`, primary: false });
  if (checkpoint !== null) out.push({ routine: "checkpoint", label: `Checkpoint ${checkpoint}`, primary: false });
  return out;
}
