"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Play, Square } from "lucide-react";
import { Prose } from "@/components/content/prose";
import { subscribeLive } from "@/components/live/event-hub";
import { Button } from "@/components/ui/button";
import { vscodeHref } from "@/lib/hrefs";
import { courseHref } from "../../../../_lib/hrefs";
import type { LearnMarkdown } from "../../../../_lib/markdown";
import { runCommand } from "../../../../_lib/run";
import type { WorkEntry } from "../../../../_lib/work";
import { draftKey, encodeDraft, restoreDraft, saveOutcome, type SaveResponse } from "../../../../_lib/work-draft";
import { cn } from "@/lib/utils";
import { CodeEditor, type CodeEditorHandle } from "./code-editor";
import { RunSplit, useInput, useRun } from "./run-panel";
import styles from "./work.module.css";

/*
 * The Work tab: work/'s file tree and an editor that autosaves to disk. Claude is told about a
 * file only on Send to Claude (or Done), never on save, and only while a lesson is live to send to. A change on disk (VS Code, or a task file
 * Claude created) reloads silently when the editor has no unsaved edits, else asks.
 */

export type OpenFile =
  | { kind: "text"; text: string; mtime: number; abs: string }
  | { kind: "binary" | "large"; abs: string };

/** Sends a message to the live lesson; false when it didn't arrive. */
export type SendToLesson = (message: string, opts?: { kind: "attempt"; path: string }) => Promise<boolean>;

type Props = {
  course: string;
  entries: WorkEntry[];
  /** `work/…` of the open file, or null for the bare tab. */
  rel: string | null;
  file: OpenFile | null;
  topics: LearnMarkdown["topics"];
  /** Unset while no lesson is live. */
  send?: SendToLesson;
};

const href = (course: string, rel: string) => courseHref(course, `/${rel.split("/").map(encodeURIComponent).join("/")}`);

export function WorkSpace({ course, entries, rel, file, topics, send }: Props) {
  const router = useRouter();

  // Tree changes (files added or removed) re-render the page; the open file handles its own.
  React.useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsubscribe = subscribeLive((e) => {
      const tree = e.type === "reconnect" || (e.type === "course" && e.course === course && e.path.startsWith("work/") && e.path !== rel);
      if (!tree) return;
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 250);
    });
    return () => {
      clearTimeout(timer);
      unsubscribe();
    };
  }, [course, rel, router]);

  return (
    <div className={styles.workspace}>
      <aside className={styles.side}>
        {entries.length ? (
          <ul className={styles.tree}>
            {entries.map((e) => (
              <li key={e.path} style={{ paddingLeft: `calc(${e.depth} * var(--space-3))` }}>
                {e.dir ? (
                  <span className={styles.dir}>{e.name}/</span>
                ) : (
                  <Link href={href(course, e.path)} className={cn(styles.file, e.path === rel && styles.fileOn)}>
                    {e.name}
                  </Link>
                )}
              </li>
            ))}
          </ul>
        ) : null}
        <NewFile course={course} />
      </aside>
      {rel && file ? (
        file.kind === "text" ? (
          <Editor key={rel} course={course} rel={rel} file={file} topics={topics} send={send} />
        ) : (
          <div className={styles.pane}>
            <div className={styles.bar}>
              <span className={styles.path}>{rel}</span>
              <span className={styles.spacer} />
              <VsCode abs={file.abs} />
            </div>
            <p className={styles.note}>
              {file.kind === "large" ? "Too large to edit here." : "Not a text file."}
            </p>
          </div>
        )
      ) : (
        <div className={cn(styles.pane, styles.blank)}>
          {entries.some((e) => !e.dir)
            ? "Pick a file."
            : "work/ is empty. Make a file for your attempt, or ask Claude to set a task."}
        </div>
      )}
    </div>
  );
}

function NewFile({ course }: { course: string }) {
  const router = useRouter();
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    const clean = name.trim().replace(/\\/g, "/").replace(/^\/+|^work\//g, "");
    if (!clean) return;
    const path = `work/${clean}`;
    const res = await fetch("/api/work", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course, path, text: "", base: null }),
    }).catch(() => null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
      return setError(data?.error ?? "Couldn't create it.");
    }
    setName("");
    setError(null);
    router.push(href(course, path));
  };

  return (
    <form className={styles.newFile} onSubmit={create}>
      <input
        className={styles.newInput}
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        placeholder="New file, e.g. scratch/flops.md"
        aria-label="New file in work/"
        spellCheck={false}
      />
      {error ? <p className={styles.error}>{error}</p> : null}
    </form>
  );
}

function VsCode({ abs }: { abs: string }) {
  return (
    <a className={styles.link} href={vscodeHref(abs)}>
      Open in VS Code
    </a>
  );
}

type Status = "saved" | "unsaved" | "saving" | "error";
type Conflict = { kind: "changed"; text: string; mtime: number } | { kind: "deleted" } | null;

const SAVE_DELAY_MS = 800;
const CHECKPOINT = /^work\/checkpoint-\d{2}\.md$/;

function Editor({
  course,
  rel,
  file,
  topics,
  send,
}: {
  course: string;
  rel: string;
  file: Extract<OpenFile, { kind: "text" }>;
  topics: LearnMarkdown["topics"];
  send?: SendToLesson;
}) {
  const editor = React.useRef<CodeEditorHandle>(null);
  const [text, setText] = React.useState(file.text);
  const [status, setStatus] = React.useState<Status>("saved");
  const [error, setError] = React.useState<string | null>(null);
  const [conflict, setConflict] = React.useState<Conflict>(null);
  const [preview, setPreview] = React.useState(false);
  const [sent, setSent] = React.useState<string | null>(null);

  // Refs, so the save loop and the disk listener always see the latest values.
  const textRef = React.useRef(file.text);
  const savedRef = React.useRef(file.text);
  const baseRef = React.useRef(file.mtime);
  const sendingRef = React.useRef<string | null>(null);
  const conflictRef = React.useRef<Conflict>(null);
  const saving = React.useRef<Promise<boolean> | null>(null);

  const markConflict = (c: Conflict) => {
    conflictRef.current = c;
    setConflict(c);
  };

  /** Mirrors unsaved edits to sessionStorage, against the disk text they were typed over. */
  const keepDraft = React.useCallback(() => {
    try {
      const draft = encodeDraft(textRef.current, savedRef.current);
      if (draft === null) sessionStorage.removeItem(draftKey(course, rel));
      else sessionStorage.setItem(draftKey(course, rel), draft);
    } catch {}
  }, [course, rel]);

  // Edits a failed save left behind come back, unless the file changed since.
  React.useEffect(() => {
    let draft: string | null = null;
    try {
      draft = restoreDraft(sessionStorage.getItem(draftKey(course, rel)), savedRef.current);
    } catch {}
    if (draft === null) return;
    editor.current?.setDoc(draft);
    textRef.current = draft;
    setText(draft);
    setStatus("unsaved");
  }, [course, rel]);

  const put = React.useCallback(
    (body: string, force = false, keepalive = false) =>
      fetch("/api/work", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ course, path: rel, text: body, base: baseRef.current, force }),
        keepalive,
      }),
    [course, rel],
  );

  /** Saves until disk matches the editor; false when a save failed or hit a conflict. */
  const save = React.useCallback(
    async (force = false): Promise<boolean> => {
      for (;;) {
        while (saving.current) await saving.current;
        if (!force && conflictRef.current) return false;
        if (!force && textRef.current === savedRef.current) return true;
        const forced = force;
        force = false;
        const body = textRef.current;
        sendingRef.current = body;
        setStatus("saving");
        const run = (async () => {
          const res = await put(body, forced).catch(() => null);
          const data = ((await res?.json().catch(() => null)) ?? null) as SaveResponse;
          sendingRef.current = null;
          const outcome = saveOutcome(res?.status ?? null, data);
          if (outcome.kind === "saved") {
            savedRef.current = body;
            baseRef.current = outcome.mtime;
            keepDraft();
            markConflict(null);
            setError(null);
            setStatus(textRef.current === body ? "saved" : "unsaved");
            return true;
          }
          if (outcome.kind === "error") setError(outcome.error);
          else markConflict(outcome);
          setStatus("error");
          return false;
        })();
        saving.current = run;
        const ok = await run;
        saving.current = null;
        // Edits made while saving go round again.
        if (!ok) return false;
      }
    },
    [put, keepDraft],
  );

  // Autosave after a pause in typing.
  React.useEffect(() => {
    if (text === savedRef.current || conflict) return;
    const timer = setTimeout(() => void save(), SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [text, conflict, save]);

  // Unsaved edits still reach disk when leaving the file or the page.
  React.useEffect(() => {
    const flush = () => {
      if (textRef.current !== savedRef.current && !conflictRef.current && !saving.current) {
        void put(textRef.current, false, true).catch(() => {});
      }
    };
    window.addEventListener("pagehide", flush);
    return () => {
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [put]);

  const load = React.useCallback((disk: string, mtime: number) => {
    editor.current?.setDoc(disk);
    textRef.current = disk;
    savedRef.current = disk;
    baseRef.current = mtime;
    keepDraft();
    setText(disk);
    setStatus("saved");
    setError(null);
    markConflict(null);
  }, [keepDraft]);

  const checkDisk = React.useCallback(async () => {
    const res = await fetch(`/api/work?${new URLSearchParams({ course, path: rel })}`).catch(() => null);
    if (!res) return;
    if (res.status === 404) {
      // The proxy's plain 404 (learn off) says nothing about the file.
      const fromRoute = (await res.json().catch(() => null)) !== null;
      if (fromRoute && !saving.current) markConflict({ kind: "deleted" });
      return;
    }
    if (!res.ok) return;
    const disk = (await res.json()) as { text: string; mtime: number };
    // Our own save echoing back through the watcher.
    if (disk.text === savedRef.current || disk.text === sendingRef.current) {
      if (disk.text === savedRef.current) baseRef.current = disk.mtime;
      if (conflictRef.current) markConflict(null);
      return;
    }
    if (textRef.current === savedRef.current && !saving.current) load(disk.text, disk.mtime);
    else markConflict({ kind: "changed", text: disk.text, mtime: disk.mtime });
  }, [course, rel, load]);

  React.useEffect(
    () =>
      subscribeLive((e) => {
        if (e.type === "reconnect" || (e.type === "course" && e.course === course && e.path === rel)) {
          void checkDisk();
        }
      }),
    [course, rel, checkDisk],
  );

  const onChange = (next: string) => {
    textRef.current = next;
    keepDraft();
    setText(next);
    setStatus(next === savedRef.current ? "saved" : "unsaved");
  };

  const submit = async (message: string, opts?: { kind: "attempt"; path: string }) => {
    if (!send || !(await save())) return;
    const ok = await send(message, opts);
    setSent(ok ? "Sent" : "Not sent");
    setTimeout(() => setSent(null), 2500);
  };

  const sendAttempt = () => void submit(`Attempt: ${rel}`, { kind: "attempt", path: rel });

  const runnable = runCommand(rel) !== null;
  const input = useInput(course, rel, runnable);
  const saveInput = input.save;
  const prepare = React.useCallback(async () => (await save()) && (await saveInput()), [save, saveInput]);
  const run = useRun(course, rel, prepare);

  const isMd = rel.endsWith(".md");
  const isCode = !isMd && !rel.endsWith(".txt");
  const checkpoint = CHECKPOINT.test(rel);
  const offline = !send;
  const deferred = React.useDeferredValue(text);
  const rendered = isMd && preview;

  const editorView = (
    <CodeEditor
      ref={editor}
      path={rel}
      initial={file.text}
      onChange={onChange}
      onBlur={() => void save()}
      onSubmit={offline ? undefined : sendAttempt}
      onRun={runnable ? run.toggle : undefined}
    />
  );

  const statusLabel =
    status === "saving" ? "Saving…" : status === "unsaved" ? "Unsaved" : status === "error" ? "Not saved" : "Saved";

  return (
    <div className={styles.pane}>
      <div className={styles.bar}>
        <span className={styles.path}>{rel}</span>
        <span className={cn(styles.status, status === "error" && styles.statusBad)} title={error ?? undefined}>
          {sent ?? statusLabel}
        </span>
        <span className={styles.spacer} />
        {isMd ? (
          <Button variant="ghost" size="sm" onClick={() => setPreview((p) => !p)} aria-pressed={preview}>
            {preview ? "Edit" : "Preview"}
          </Button>
        ) : null}
        {isCode ? <VsCode abs={file.abs} /> : null}
        {runnable ? (
          <Button
            variant="outline"
            size="sm"
            title={run.running ? "Stop the run" : "Run this file (Ctrl+Shift+Enter)"}
            onClick={run.toggle}
          >
            {run.running ? <Square size={12} aria-hidden /> : <Play size={12} aria-hidden />}
            {run.running ? "Stop" : "Run"}
          </Button>
        ) : null}
        <Button
          variant={checkpoint ? "outline" : "default"}
          size="sm"
          disabled={offline}
          title={offline ? "No lesson is live to send to." : "Ask Claude to read this file (Ctrl+Enter)"}
          onClick={sendAttempt}
        >
          Send to Claude
        </Button>
        {checkpoint ? (
          <Button
            size="sm"
            disabled={offline}
            title={offline ? "No lesson is live to send to." : "Hand the checkpoint in for marking"}
            onClick={() => {
              if (window.confirm("Hand in this checkpoint for marking?")) void submit("done");
            }}
          >
            Done
          </Button>
        ) : null}
      </div>
      {conflict ? (
        <div className={styles.conflict} role="alert">
          <span>{conflict.kind === "changed" ? "Changed on disk." : "Deleted on disk."}</span>
          {conflict.kind === "changed" ? (
            <Button variant="outline" size="sm" onClick={() => load(conflict.text, conflict.mtime)}>
              Reload
            </Button>
          ) : null}
          <Button variant="outline" size="sm" onClick={() => void save(true)}>
            Keep mine
          </Button>
        </div>
      ) : error ? (
        <div className={styles.conflict} role="alert">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => void save()}>
            Retry
          </Button>
        </div>
      ) : null}
      <div className={styles.body}>
        {runnable ? (
          <RunSplit rel={rel} run={run} input={input}>
            {editorView}
          </RunSplit>
        ) : (
          <>
            <div className={cn(styles.code, rendered && styles.hidden)}>{editorView}</div>
            {rendered ? (
              <div className={styles.preview} data-quote-source>
                <Prose markdown={deferred} context={{ id: "learn", course, topics }} />
              </div>
            ) : null}
          </>
        )}
      </div>
    </div>
  );
}
