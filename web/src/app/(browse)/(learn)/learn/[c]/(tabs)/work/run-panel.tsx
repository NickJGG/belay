"use client";

import * as React from "react";
import { subscribeLive } from "@/components/live/event-hub";
import { Button } from "@/components/ui/button";
import { inputPath, runCommand, type RunEvent } from "@/app/(browse)/(learn)/_lib/run";
import { cn } from "@/lib/utils";
import styles from "./work.module.css";

/*
 * Run: a work/ file's output panel. A run is never an attempt: its output stays on this page.
 * The Input pane is the file's `.in` sidecar, piped to stdin on every run.
 */

type Chunk = { s: "out" | "err"; t: string };
type End = Extract<RunEvent, { exit: unknown }>;
type Output = { chunks: Chunk[]; end: End | null };

// The last run per file, so switching files and back keeps it.
const outputs = new Map<string, Output>();

const SAVE_DELAY_MS = 800;
const HEIGHT_KEY = "belay:work-output";
const MIN_HEIGHT = 80;

const append = (chunks: Chunk[], c: Chunk): Chunk[] => {
  const last = chunks.at(-1);
  return last?.s === c.s ? [...chunks.slice(0, -1), { s: c.s, t: last.t + c.t }] : [...chunks, c];
};

/** Runs `rel` after `prepare` (saving) succeeds; running again while running stops it. */
export function useRun(course: string, rel: string, prepare: () => Promise<boolean>) {
  const key = `${course}/${rel}`;
  const [output, setOutput] = React.useState<Output>(() => outputs.get(key) ?? { chunks: [], end: null });
  const [running, setRunning] = React.useState(false);
  const abort = React.useRef<AbortController | null>(null);

  React.useEffect(() => {
    if (!running) outputs.set(key, output);
  }, [key, output, running]);

  React.useEffect(() => () => abort.current?.abort(), []);

  const stop = React.useCallback(() => abort.current?.abort(), []);

  const start = React.useCallback(async () => {
    if (abort.current) return;
    const controller = new AbortController();
    abort.current = controller;
    setRunning(true);
    const began = Date.now();
    let end: End | null = null;
    try {
      if (!(await prepare())) {
        setOutput({ chunks: [{ s: "err", t: "Not run: the file or its input didn't save.\n" }], end: null });
        return;
      }
      setOutput({ chunks: [], end: null });
      const res = await fetch("/api/work/run", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course, path: rel }),
        signal: controller.signal,
      });
      if (!res.ok || !res.body) {
        const data = (await res.json().catch(() => null)) as { error?: string } | null;
        setOutput({ chunks: [{ s: "err", t: `${data?.error ?? "The site server didn't answer."}\n` }], end: null });
        return;
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = "";
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        const lines = buffer.split("\n");
        buffer = lines.pop()!;
        const chunks: Chunk[] = [];
        for (const e of lines.filter(Boolean).map((l) => JSON.parse(l) as RunEvent)) {
          if ("exit" in e) end = e;
          else chunks.push(e);
        }
        const ended = end;
        setOutput((o) => ({ chunks: chunks.reduce(append, o.chunks), end: ended }));
      }
    } catch (err) {
      if (!controller.signal.aborted) {
        setOutput((o) => ({ ...o, chunks: append(o.chunks, { s: "err", t: `${(err as Error).message}\n` }) }));
      }
    } finally {
      if (controller.signal.aborted && end === null) {
        setOutput((o) => ({ ...o, end: { exit: null, ms: Date.now() - began, stopped: true } }));
      }
      abort.current = null;
      setRunning(false);
    }
  }, [course, rel, prepare]);

  const toggle = React.useCallback(() => (abort.current ? stop() : void start()), [start, stop]);
  const clear = React.useCallback(() => setOutput({ chunks: [], end: null }), []);

  return { output, running, toggle, clear };
}

/** The `.in` sidecar's text, autosaved like the editor; the file is made on first non-empty input. */
export function useInput(course: string, rel: string, enabled: boolean) {
  const path = inputPath(rel);
  const [text, setText] = React.useState("");
  const textRef = React.useRef("");
  const savedRef = React.useRef("");
  const exists = React.useRef(false);
  const saving = React.useRef<Promise<boolean> | null>(null);

  const load = React.useCallback(async () => {
    const res = await fetch(`/api/work?${new URLSearchParams({ course, path })}`).catch(() => null);
    if (!res || (!res.ok && res.status !== 404)) return;
    const disk = res.ok ? ((await res.json()) as { text: string }).text : "";
    exists.current = res.ok;
    // Typing since the request went out wins.
    if (textRef.current !== savedRef.current) return;
    textRef.current = savedRef.current = disk;
    setText(disk);
  }, [course, path]);

  React.useEffect(() => {
    if (!enabled) return;
    void load();
    return subscribeLive((e) => {
      if (e.type === "reconnect" || (e.type === "course" && e.course === course && e.path === path)) void load();
    });
  }, [course, path, load, enabled]);

  const put = React.useCallback(
    (body: string, keepalive = false) =>
      fetch("/api/work", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        // Last write wins: the input is scratch, not worth a conflict prompt.
        body: JSON.stringify({ course, path, text: body, base: null, force: true }),
        keepalive,
      }),
    [course, path],
  );

  const save = React.useCallback(async (): Promise<boolean> => {
    while (saving.current) await saving.current;
    const body = textRef.current;
    if (body === savedRef.current || (!exists.current && !body)) return true;
    const run = put(body)
      .then((res) => res.ok)
      .catch(() => false)
      .then((ok) => {
        if (ok) {
          savedRef.current = body;
          exists.current = true;
        }
        return ok;
      });
    saving.current = run;
    const ok = await run;
    saving.current = null;
    return ok;
  }, [put]);

  React.useEffect(() => {
    if (text === savedRef.current) return;
    const timer = setTimeout(() => void save(), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, save]);

  React.useEffect(() => {
    const flush = () => {
      const body = textRef.current;
      if (body !== savedRef.current && (exists.current || body) && !saving.current) void put(body, true).catch(() => {});
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [put]);

  const onChange = (next: string) => {
    textRef.current = next;
    setText(next);
  };

  return { path, text, onChange, save };
}

function endLabel(end: End): string {
  const ms = end.ms < 1000 ? `${end.ms} ms` : `${(end.ms / 1000).toFixed(1)} s`;
  if (end.capped) return `Stopped at 1 MB of output · ${ms}`;
  if (end.stopped) return `Stopped · ${ms}`;
  return `${end.exit === null ? "Didn't start" : `Exit ${end.exit}`} · ${ms}`;
}

/** The editor above, a drag handle, then Input beside Output. */
export function RunSplit({
  rel,
  run,
  input,
  children,
}: {
  rel: string;
  run: ReturnType<typeof useRun>;
  input: ReturnType<typeof useInput>;
  children: React.ReactNode;
}) {
  const split = React.useRef<HTMLDivElement>(null);
  const out = React.useRef<HTMLPreElement>(null);
  const [height, setHeight] = React.useState(220);
  const command = runCommand(rel)!;
  const { output, running } = run;

  React.useEffect(() => {
    const saved = Number(localStorage.getItem(HEIGHT_KEY));
    // eslint-disable-next-line react-hooks/set-state-in-effect -- localStorage is client-only
    if (saved >= MIN_HEIGHT) setHeight(saved);
  }, []);

  // Follow new output unless the reader has scrolled up.
  React.useLayoutEffect(() => {
    const el = out.current;
    if (el && el.scrollHeight - el.scrollTop - el.clientHeight < 80) el.scrollTop = el.scrollHeight;
  }, [output]);

  const drag = (event: React.PointerEvent<HTMLDivElement>) => {
    const handle = event.currentTarget;
    const startY = event.clientY;
    const startH = height;
    const max = (split.current?.clientHeight ?? 600) - MIN_HEIGHT;
    let next = startH;
    handle.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent) => {
      next = Math.round(Math.min(max, Math.max(MIN_HEIGHT, startH - (e.clientY - startY))));
      setHeight(next);
    };
    const up = () => {
      handle.removeEventListener("pointermove", move);
      handle.removeEventListener("pointerup", up);
      localStorage.setItem(HEIGHT_KEY, String(next));
    };
    handle.addEventListener("pointermove", move);
    handle.addEventListener("pointerup", up);
  };

  return (
    <div ref={split} className={styles.split}>
      <div className={styles.splitTop}>{children}</div>
      <div
        className={styles.handle}
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the output panel"
        onPointerDown={drag}
      />
      <div className={styles.run} style={{ height }}>
        <div className={styles.runHead}>
          <span className={styles.runTitle}>Output</span>
          {running ? (
            <span className={styles.runState}>● Running…</span>
          ) : output.end ? (
            <span className={cn(styles.runState, (output.end.exit !== 0 || output.end.stopped) && styles.runBad)}>
              {endLabel(output.end)}
            </span>
          ) : null}
          <code className={styles.runCommand}>{[command.cmd, ...command.args].join(" ")}</code>
          <span className={styles.spacer} />
          <Button
            variant="ghost"
            size="sm"
            onClick={run.clear}
            disabled={running || (!output.chunks.length && !output.end)}
          >
            Clear
          </Button>
        </div>
        <div className={styles.runBody}>
          <label className={styles.input}>
            <span className={styles.inputHead}>
              Input <span className={styles.inputNote}>Saved as {input.path.slice(input.path.lastIndexOf("/") + 1)}</span>
            </span>
            <textarea
              className={styles.inputText}
              value={input.text}
              onChange={(e) => input.onChange(e.target.value)}
              onBlur={() => void input.save()}
              placeholder="stdin for every run"
              spellCheck={false}
            />
          </label>
          <pre ref={out} className={styles.output} aria-live="polite">
            {output.chunks.map((c, i) => (
              <span key={i} className={c.s === "err" ? styles.stderr : undefined}>
                {c.t}
              </span>
            ))}
          </pre>
        </div>
      </div>
    </div>
  );
}
