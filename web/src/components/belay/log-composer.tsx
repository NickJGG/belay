"use client";

import * as React from "react";
import { createLog } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { useIntent } from "./intents";
import { toastError } from "./toaster";
import styles from "./belay.module.css";

/** Today back to the oldest day a log entry may be filed under; `days` is that list, `today` first, labelled. */
export type DayOption = [value: string, label: string];

/**
 * "Log what you did" atop a project's Logs: the text (its first line is the entry's title), the
 * project's kinds as chips with a count, and the day it counts toward.
 */
export function LogComposer({ project, kinds, days }: { project: string; kinds: string[]; days: DayOption[] }) {
  const [text, setText] = React.useState("");
  const [kind, setKind] = React.useState("");
  const [count, setCount] = React.useState("");
  const [day, setDay] = React.useState(days[0]?.[0] ?? "today");
  const [pending, start] = React.useTransition();
  const textRef = React.useRef<HTMLTextAreaElement>(null);
  useIntent("log", project, () => textRef.current?.focus());
  const submit = () => {
    if (pending || !text.trim()) return;
    start(async () => {
      const r = await createLog({ project, text, kind: kind || undefined, count: kind && count.trim() ? Number(count) : undefined, day });
      if (r.error) return toastError(r.error);
      setText("");
      setKind("");
      setCount("");
    });
  };
  return (
    <div className={styles.composer}>
      <textarea
        ref={textRef}
        className={styles.composerText}
        aria-label="What you did"
        placeholder="Log what you did…"
        rows={Math.min(8, Math.max(1, text.split("\n").length))}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) submit();
        }}
      />
      {text ? (
        <div className={styles.createRow}>
          {kinds.map((k) => (
            <button key={k} type="button" className={cn(styles.pill, kind === k && styles.pillOn)} aria-pressed={kind === k} onClick={() => setKind(kind === k ? "" : k)}>
              {k}
            </button>
          ))}
          {kind ? (
            <input className={cn(styles.input, styles.count)} type="number" min={1} aria-label="Count" placeholder="× 1" value={count} onChange={(e) => setCount(e.target.value)} />
          ) : null}
          <select className={styles.select} aria-label="Day" value={day} onChange={(e) => setDay(e.target.value)}>
            {days.map(([v, l]) => (
              <option key={v} value={v}>
                {l}
              </option>
            ))}
          </select>
          <span className={styles.hintLeft}>Ctrl ↵ to log</span>
          <Button size="sm" onClick={submit} disabled={pending || !text.trim()}>
            Log
          </Button>
        </div>
      ) : null}
    </div>
  );
}
