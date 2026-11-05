"use client";

import * as React from "react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ChevronsLeft, ChevronsRight, Play, Plus, Square } from "lucide-react";
import { createPortal } from "react-dom";
import { Prose } from "@/components/content/prose";
import { subscribeLive } from "@/components/live/event-hub";
import { MenuButton } from "@/components/belay/controls";
import belay from "@/components/belay/belay.module.css";
import { Button, buttonClass } from "@/components/ui/button";
import popover from "@/components/ui/popover.module.css";
import { vscodeHref } from "@/lib/hrefs";
import { courseHref } from "../../../../_lib/hrefs";
import type { LearnMarkdown } from "../../../../_lib/markdown";
import { runCommand } from "../../../../_lib/run";
import type { WorkEntry } from "../../../../_lib/work";
import { NEW_KINDS, newFilePath, type NewKind } from "../../../../_lib/new-file";
import { draftKey, encodeDraft, restoreDraft, saveOutcome, type SaveResponse } from "../../../../_lib/work-draft";
import { cn } from "@/lib/utils";
import type { BodyHandle } from "../../../../../answer-formats/body.ts";
import type { Selection } from "../../../../../answer-formats/excalidraw/editor.tsx";
import { FormatIcon } from "../../../../../answer-formats/icons.tsx";
import { formatFor, iconFor, type Summary } from "../../../../../answer-formats/index.ts";
import { askLabel, askMessage } from "../../../../_lib/ask";
import { attemptText, warningsLabel } from "../../../../_lib/attempt";
import { CodeEditor } from "./code-editor";
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

  const [rail, setRail] = useRail();

  return (
    <div className={cn(styles.workspace, rail && styles.workspaceRail)}>
      {rail ? (
        <aside className={styles.rail}>
          <button type="button" className={styles.railButton} title="Show files" aria-label="Show files" onClick={() => setRail(false)}>
            <ChevronsRight size={14} aria-hidden />
          </button>
          {entries
            .filter((e) => !e.dir)
            .map((e) => (
              <Link
                key={e.path}
                href={href(course, e.path)}
                className={cn(styles.railButton, e.path === rel && styles.fileOn)}
                title={e.path}
                aria-label={e.path}
                aria-current={e.path === rel ? "page" : undefined}
              >
                <FormatIcon name={iconFor(e.path)} />
              </Link>
            ))}
        </aside>
      ) : (
        <aside className={styles.side}>
          <div className={styles.sideHead}>
            <NewFile course={course} />
            <button type="button" className={styles.railButton} title="Collapse files" aria-label="Collapse files" onClick={() => setRail(true)}>
              <ChevronsLeft size={14} aria-hidden />
            </button>
          </div>
          {entries.length ? (
            <ul className={styles.tree}>
              {entries.map((e) => (
                <li key={e.path} style={{ paddingLeft: `calc(${e.depth} * var(--space-3))` }}>
                  {e.dir ? (
                    <span className={styles.dir}>{e.name}/</span>
                  ) : (
                    <Link href={href(course, e.path)} className={cn(styles.file, e.path === rel && styles.fileOn)}>
                      <FormatIcon name={iconFor(e.path)} size={12} />
                      <span className={styles.fileName}>{e.name}</span>
                    </Link>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </aside>
      )}
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

const RAIL_KEY = "belay:learn:work-rail";

/** Whether the file tree is collapsed to an icon rail; expanded until the learner collapses it. */
function useRail() {
  const [rail, setRail] = React.useState(false);
  React.useEffect(() => {
    try {
      setRail(localStorage.getItem(RAIL_KEY) === "1");
    } catch {}
  }, []);
  const set = React.useCallback((on: boolean) => {
    setRail(on);
    try {
      localStorage.setItem(RAIL_KEY, on ? "1" : "0");
    } catch {}
  }, []);
  return [rail, set] as const;
}

/** + New: pick a kind of file, then name it. "Other…" takes a whole file name. */
function NewFile({ course }: { course: string }) {
  const router = useRouter();
  const [kind, setKind] = React.useState<NewKind | "other" | null>(null);
  const [name, setName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const pick = (k: NewKind | "other") => {
    setKind(k);
    setName("");
    setError(null);
  };

  const create = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!kind) return;
    const path = newFilePath(name, kind === "other" ? "" : kind.ext);
    if (!path) return;
    const res = await fetch("/api/work", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ course, path, text: kind === "other" ? "" : kind.body(), base: null }),
    }).catch(() => null);
    if (!res?.ok) {
      const data = (await res?.json().catch(() => ({}))) as { error?: string } | undefined;
      return setError(data?.error ?? "Couldn't create it.");
    }
    setKind(null);
    setName("");
    setError(null);
    router.push(href(course, path));
  };

  return (
    <div className={styles.newFile}>
      <MenuButton
        label="New file"
        className={buttonClass("ghost", "sm")}
        trigger={
          <>
            <Plus size={12} aria-hidden />
            New
          </>
        }
      >
        {(close) => (
          <>
            {NEW_KINDS.map((k) => (
              <button
                key={k.ext}
                type="button"
                role="menuitem"
                className={belay.menuItem}
                onClick={() => {
                  close();
                  pick(k);
                }}
              >
                <FormatIcon name={k.icon} />
                {k.label}
                <span className={styles.newExt}>{k.ext}</span>
              </button>
            ))}
            <button
              type="button"
              role="menuitem"
              className={belay.menuItem}
              onClick={() => {
                close();
                pick("other");
              }}
            >
              <FormatIcon name="file" />
              Other…
            </button>
          </>
        )}
      </MenuButton>
      {kind ? (
        <form className={styles.newForm} onSubmit={create}>
          <input
            className={styles.newInput}
            value={name}
            autoFocus
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setKind(null);
            }}
            onBlur={() => {
              if (!name.trim()) setKind(null);
            }}
            placeholder={kind === "other" ? "e.g. scratch/flops.md" : `name, e.g. scratch/feed`}
            aria-label={kind === "other" ? "New file in work/" : `New ${kind.label} in work/ (${kind.ext} is added)`}
            spellCheck={false}
          />
          {kind !== "other" ? <span className={styles.newExt}>{kind.ext}</span> : null}
        </form>
      ) : null}
      {error ? <p className={styles.error}>{error}</p> : null}
    </div>
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

const ExcalidrawBody = dynamic(() => import("../../../../../answer-formats/excalidraw/editor.tsx"), { ssr: false });

const SAVE_DELAY_MS = 800;
const SUMMARY_DELAY_MS = 300;
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
  const editor = React.useRef<BodyHandle>(null);
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

  const format = formatFor(rel);
  const textual = format.id === "text";
  const summary = useSummary(format.summarize, text, rel);
  const [showSummary, setShowSummary] = React.useState(false);

  const sendAttempt = () =>
    void submit(attemptText(format, textRef.current, rel, file.abs), { kind: "attempt", path: rel });

  const runnable = textual && runCommand(rel) !== null;
  const input = useInput(course, rel, runnable);
  const saveInput = input.save;
  const prepare = React.useCallback(async () => (await save()) && (await saveInput()), [save, saveInput]);
  const run = useRun(course, rel, prepare);

  const isMd = textual && rel.endsWith(".md");
  const isCode = textual && !isMd && !rel.endsWith(".txt");
  const checkpoint = CHECKPOINT.test(rel);
  const offline = !send;
  const deferred = React.useDeferredValue(text);
  const rendered = isMd && preview;

  const warnings = summary ? warningsLabel(summary.warnings) : null;

  const [selection, setSelection] = React.useState<Selection | null>(null);
  const [asking, setAsking] = React.useState<{ top: number; left: number } | null>(null);
  const focusLines = React.useMemo(() => {
    if (!selection || !format.focus) return [];
    try {
      return format.focus(deferred, selection.id);
    } catch {
      return [];
    }
  }, [format, deferred, selection]);
  const askAbout = focusLines.length ? askLabel(focusLines[0]) : null;
  const canAsk = !!send && !!askAbout && !showSummary;
  const askButton = React.useRef<HTMLButtonElement>(null);
  const closeAsk = React.useCallback(() => setAsking(null), []);
  const select = React.useCallback((s: Selection | null) => {
    setSelection(s);
    setAsking(null);
  }, []);

  const openAsk = () => {
    const at = selection?.rect() ?? askButton.current?.getBoundingClientRect();
    if (at) setAsking({ top: at.bottom + 8, left: at.left });
  };

  const ask = async (question: string) => {
    if (!askAbout || !question.trim()) return;
    setAsking(null);
    await submit(askMessage(question, askAbout, rel, focusLines));
  };

  // The canvas reads `initial` only on mount, and loads later than a draft restore runs.
  const editorView = textual ? (
    <CodeEditor
      ref={editor}
      path={rel}
      initial={file.text}
      onChange={onChange}
      onBlur={() => void save()}
      onSubmit={offline ? undefined : sendAttempt}
      onRun={runnable ? run.toggle : undefined}
    />
  ) : (
    <ExcalidrawBody ref={editor} initial={text} onChange={onChange} onSelect={select} />
  );

  const statusLabel =
    status === "saving" ? "Saving…" : status === "unsaved" ? "Unsaved" : status === "error" ? "Not saved" : "Saved";

  return (
    <div className={styles.pane} data-canvas={textual ? undefined : ""}>
      <div className={styles.bar}>
        <span className={styles.path}>{rel}</span>
        <span className={cn(styles.status, status === "error" && styles.statusBad)} title={error ?? undefined}>
          {sent ?? statusLabel}
        </span>
        <span className={styles.spacer} />
        {warnings ? (
          <span className={styles.warnings} title="Claude reads these as drawn, without guessing what you meant">
            ⚠ {warnings}
          </span>
        ) : null}
        {format.summarize ? (
          <Button variant="ghost" size="sm" onClick={() => setShowSummary((s) => !s)} aria-pressed={showSummary}>
            What Claude sees
          </Button>
        ) : null}
        {canAsk ? (
          <Button
            ref={askButton}
            variant="ghost"
            size="sm"
            className={styles.askButton}
            title={`Ask Claude about ${askAbout}`}
            onClick={openAsk}
            aria-expanded={!!asking}
          >
            <span>Ask about {askAbout}</span>
          </Button>
        ) : null}
        {canAsk && asking ? <AskBox at={asking} about={askAbout!} onAsk={ask} onClose={closeAsk} /> : null}
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
        ) : !textual ? (
          <>
            <div className={cn(styles.code, showSummary && styles.hidden)}>{editorView}</div>
            {showSummary ? <pre className={styles.summary}>{summary?.text ?? "Can't read this file."}</pre> : null}
          </>
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

/** A question about the selected shape, in a panel under it. Escape or a click outside closes it. */
function AskBox({
  at,
  about,
  onAsk,
  onClose,
}: {
  at: { top: number; left: number };
  about: string;
  onAsk: (question: string) => void;
  onClose: () => void;
}) {
  const panel = React.useRef<HTMLFormElement>(null);
  const [question, setQuestion] = React.useState("");

  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onDown = (e: PointerEvent) => {
      if (!panel.current?.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKey);
    document.addEventListener("pointerdown", onDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("pointerdown", onDown);
    };
  }, [onClose]);

  const top = Math.min(at.top, window.innerHeight - 220);
  return createPortal(
    <form
      ref={panel}
      role="dialog"
      aria-label={`Ask about ${about}`}
      className={cn(popover.panel, styles.askBox)}
      style={{ "--pop-top": `${Math.max(8, top)}px`, "--pop-left": `${Math.max(8, at.left)}px` } as React.CSSProperties}
      onSubmit={(e) => {
        e.preventDefault();
        onAsk(question);
      }}
    >
      <textarea
        className={styles.askText}
        value={question}
        autoFocus
        rows={3}
        placeholder={`Ask about ${about}`}
        aria-label={`Question about ${about}`}
        onChange={(e) => setQuestion(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onAsk(question);
          }
        }}
      />
      <div className={styles.askFoot}>
        <span className={styles.askHint}>Sends your question with this shape&apos;s summary lines.</span>
        <Button type="submit" size="sm" disabled={!question.trim()}>
          Ask
        </Button>
      </div>
    </form>,
    document.body,
  );
}

/** The format's summary of the live document, after a pause in edits; null when it has none or can't read it. */
function useSummary(summarize: ((text: string, name: string) => Summary) | undefined, text: string, rel: string) {
  const compute = React.useCallback(() => {
    if (!summarize) return null;
    try {
      return summarize(text, rel);
    } catch {
      return null;
    }
  }, [summarize, text, rel]);
  const [summary, setSummary] = React.useState<Summary | null>(compute);
  React.useEffect(() => {
    const timer = setTimeout(() => setSummary(compute()), SUMMARY_DELAY_MS);
    return () => clearTimeout(timer);
  }, [compute]);
  return summary;
}
