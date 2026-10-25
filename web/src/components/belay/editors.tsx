"use client";
/** The issue page's description and comments, and a log entry's text: Markdown shown, edited in place. */
import * as React from "react";
import { Pencil, Trash2 } from "lucide-react";
import { ago } from "../../../../src/time.ts";
import type { Comment } from "../../../../src/store.ts";
import { addIssueComment, deleteIssueComment, editIssueComment, editLogEntry, saveIssueBody } from "@/app/actions";
import { Prose } from "@/components/content/prose";
import { Button } from "@/components/ui/button";
import { toastError } from "./toaster";
import styles from "./editors.module.css";

const isSubmit = (e: React.KeyboardEvent) => e.key === "Enter" && (e.ctrlKey || e.metaKey);

/** Warns before leaving the page while `dirty`. */
function useUnsaved(dirty: boolean) {
  React.useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);
}

/** A Markdown textarea with Write/Preview tabs. It grows with its content from `minRows`. */
export function MarkdownField({
  value,
  onChange,
  onKeyDown,
  minRows,
  label = "Description",
  placeholder,
  autoFocus,
}: {
  value: string;
  onChange: (value: string) => void;
  onKeyDown?: (e: React.KeyboardEvent<HTMLTextAreaElement>) => void;
  minRows: number;
  label?: string;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [preview, setPreview] = React.useState(false);
  return (
    <div className={styles.field}>
      <div className={styles.tabs} role="tablist">
        <button type="button" role="tab" aria-selected={!preview} className={styles.tab} onClick={() => setPreview(false)}>
          Write
        </button>
        <button type="button" role="tab" aria-selected={preview} className={styles.tab} onClick={() => setPreview(true)}>
          Preview
        </button>
      </div>
      {preview ? (
        <div className={styles.preview}>{value.trim() ? <Prose markdown={value} /> : <span className={styles.hint}>Nothing to preview.</span>}</div>
      ) : (
        <textarea
          className={styles.textarea}
          aria-label={label}
          placeholder={placeholder}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          rows={Math.max(minRows, value.split("\n").length + 2)}
          autoFocus={autoFocus}
        />
      )}
    </div>
  );
}

function Actions({ hint, children }: { hint: string; children: React.ReactNode }) {
  return (
    <div className={styles.actions}>
      <span className={styles.hint}>{hint}</span>
      {children}
    </div>
  );
}

type Mode = "view" | "edit" | "conflict";

/**
 * `body` and `hash` are what's on disk now: live sync refreshes them under an open editor, so a `hash` that no
 * longer matches the one editing started from means someone else changed the file. Only Cancel drops the draft.
 */
export function BodyEditor({ id, body, hash }: { id: string; body: string; hash: string }) {
  const [mode, setMode] = React.useState<Mode>("view");
  const [draft, setDraft] = React.useState("");
  const [original, setOriginal] = React.useState("");
  const [base, setBase] = React.useState(hash);
  const [disk, setDisk] = React.useState({ body: "", hash: "" });
  const [pending, start] = React.useTransition();
  const dirty = mode !== "view" && draft !== original;
  const stale = mode === "edit" && hash !== base;
  useUnsaved(dirty);

  const edit = () => {
    setDraft(body);
    setOriginal(body);
    setBase(hash);
    setMode("edit");
  };
  const cancel = () => {
    if (dirty && !window.confirm("Discard your draft?")) return;
    setMode("view");
  };
  const save = (expected: string) =>
    start(async () => {
      const r = await saveIssueBody(id, draft, expected);
      if (r.conflict !== undefined) {
        setDisk({ body: r.conflict, hash: r.hash! });
        setMode("conflict");
      } else if (r.error) {
        toastError(r.error);
      } else {
        setBase(r.hash!);
        setMode("view");
      }
    });
  const keys = (e: React.KeyboardEvent) => {
    if (isSubmit(e)) save(mode === "conflict" ? disk.hash : base);
    if (e.key === "Escape") cancel();
  };

  if (mode === "view") {
    return (
      <section className={styles.body}>
        {body ? (
          <>
            <Prose markdown={body} />
            <div className={styles.actions}>
              <Button variant="ghost" size="sm" onClick={edit}>
                <Pencil size={13} aria-hidden /> Edit
              </Button>
            </div>
          </>
        ) : (
          <button type="button" className={styles.placeholder} onClick={edit}>
            Add a description…
          </button>
        )}
      </section>
    );
  }

  if (mode === "conflict") {
    return (
      <section className={styles.body}>
        <div className={styles.note} role="alert">
          The description changed on disk while you were editing. Merge by hand: your draft is on the left, the file as
          it is now on the right. Saving replaces the file with your draft.
        </div>
        <div className={styles.conflict}>
          <label className={styles.pane}>
            <span className={styles.paneHead}>Your draft</span>
            <textarea className={styles.textarea} value={draft} onChange={(e) => setDraft(e.target.value)} onKeyDown={keys} rows={16} />
          </label>
          <div className={styles.pane}>
            <span className={styles.paneHead}>On disk</span>
            <pre className={styles.disk}>{disk.body || "(empty)"}</pre>
          </div>
        </div>
        <Actions hint="">
          <Button variant="outline" size="sm" onClick={() => setMode("edit")} disabled={pending}>
            Back to editor
          </Button>
          <Button size="sm" onClick={() => save(disk.hash)} disabled={pending}>
            Save my draft
          </Button>
        </Actions>
      </section>
    );
  }

  return (
    <section className={styles.body}>
      {stale && (
        <div className={styles.note} role="status">
          Changed on disk since you started editing.{" "}
          <button
            type="button"
            className={styles.link}
            onClick={() => {
              setDisk({ body, hash });
              setMode("conflict");
            }}
          >
            Compare
          </button>
        </div>
      )}
      <MarkdownField value={draft} onChange={setDraft} onKeyDown={keys} minRows={10} autoFocus />
      <Actions hint="Markdown · Ctrl+Enter to save · Esc to cancel">
        <Button variant="outline" size="sm" onClick={cancel} disabled={pending}>
          Cancel
        </Button>
        <Button size="sm" onClick={() => save(base)} disabled={pending}>
          Save
        </Button>
      </Actions>
    </section>
  );
}

/** `n` and `at` identify a comment as loaded; the ops refuse an edit or delete if live sync has since moved `#n`. */
type Target = { n: number; at: string };

/** Belay's comment cards, with a composer under them. */
export function Comments({ id, comments }: { id: string; comments: Comment[] }) {
  const [draft, setDraft] = React.useState("");
  const [editing, setEditing] = React.useState<Target & { original: string; text: string }>();
  const [deleting, setDeleting] = React.useState<Target>();
  const [pending, start] = React.useTransition();
  useUnsaved(draft.trim() !== "" || (editing !== undefined && editing.text !== editing.original));

  const post = () => {
    if (!draft.trim()) return;
    start(async () => {
      const r = await addIssueComment(id, draft);
      if (r.error) toastError(r.error);
      else setDraft("");
    });
  };
  const save = () =>
    start(async () => {
      if (!editing) return;
      const r = await editIssueComment(id, editing.n, editing.at, editing.text);
      if (r.error) toastError(r.error);
      else setEditing(undefined);
    });
  const cancelEdit = () => {
    if (editing && editing.text !== editing.original && !window.confirm("Discard your edit?")) return;
    setEditing(undefined);
  };
  const remove = (t: Target) =>
    start(async () => {
      const r = await deleteIssueComment(id, t.n, t.at);
      if (r.error) toastError(r.error);
      setDeleting(undefined);
    });

  return (
    <section className={styles.thread} aria-labelledby="comments-title">
      <h2 id="comments-title" className={styles.threadTitle}>
        Comments
      </h2>
      {comments.length > 0 && (
        <ol className={styles.comments}>
          {comments.map((c, i) => {
            const n = i + 1;
            const isEditing = editing?.n === n;
            return (
              <li key={`${n}-${c.at}`} className={styles.comment}>
                <div className={styles.commentHead}>
                  <span className={styles.author}>{c.by === "claude" ? "Claude" : "You"}</span>
                  {/* Relative to the clock at render, so the server's and the browser's can straddle a minute. */}
                  <time className={styles.hint} dateTime={c.at} title={c.at.replace("T", " ")} suppressHydrationWarning>
                    {ago(c.at)}
                  </time>
                  {deleting?.n === n ? (
                    <span className={styles.confirm}>
                      Delete?
                      <button type="button" className={styles.link} onClick={() => remove(deleting)} disabled={pending}>
                        Yes
                      </button>
                      <button type="button" className={styles.link} onClick={() => setDeleting(undefined)} disabled={pending} autoFocus>
                        No
                      </button>
                    </span>
                  ) : (
                    !isEditing && (
                      <span className={styles.commentActions}>
                        <button
                          type="button"
                          className={styles.icon}
                          title="Edit"
                          aria-label={`Edit comment ${n}`}
                          onClick={() => setEditing({ n, at: c.at, original: c.text, text: c.text })}
                        >
                          <Pencil size={13} aria-hidden />
                        </button>
                        <button type="button" className={styles.icon} title="Delete" aria-label={`Delete comment ${n}`} onClick={() => setDeleting({ n, at: c.at })}>
                          <Trash2 size={13} aria-hidden />
                        </button>
                      </span>
                    )
                  )}
                </div>
                {isEditing ? (
                  <>
                    <MarkdownField
                      label="Comment"
                      value={editing.text}
                      onChange={(text) => setEditing({ ...editing, text })}
                      onKeyDown={(e) => {
                        if (isSubmit(e)) save();
                        if (e.key === "Escape") cancelEdit();
                      }}
                      minRows={3}
                      autoFocus
                    />
                    <Actions hint="Ctrl+Enter to save · Esc to cancel">
                      <Button variant="outline" size="sm" onClick={cancelEdit} disabled={pending}>
                        Cancel
                      </Button>
                      <Button size="sm" onClick={save} disabled={pending || !editing.text.trim()}>
                        Save
                      </Button>
                    </Actions>
                  </>
                ) : (
                  <Prose markdown={c.text} className={styles.commentText} />
                )}
              </li>
            );
          })}
        </ol>
      )}
      <MarkdownField
        label="New comment"
        placeholder="Leave a comment…"
        value={draft}
        onChange={setDraft}
        onKeyDown={(e) => {
          if (isSubmit(e)) post();
        }}
        minRows={3}
      />
      <Actions hint="Markdown · Ctrl+Enter to post">
        <Button size="sm" onClick={post} disabled={pending || !draft.trim()}>
          Comment
        </Button>
      </Actions>
    </section>
  );
}

/**
 * A log entry's text after its first line, which is the page's title; editing takes the whole text. `BodyEditor`
 * without its conflict mode: the action's `at` check refuses a save to an address now holding another entry.
 */
export function LogText({ address, at, text }: { address: string; at: string; text: string }) {
  const [editing, setEditing] = React.useState(false);
  const [draft, setDraft] = React.useState("");
  const [pending, start] = React.useTransition();
  useUnsaved(editing && draft !== text);

  const cancel = () => {
    if (draft !== text && !window.confirm("Discard your draft?")) return;
    setEditing(false);
  };
  const save = () =>
    start(async () => {
      const r = await editLogEntry(address, at, { text: draft });
      if (r.error) toastError(r.error);
      else setEditing(false);
    });

  if (!editing) {
    const rest = text.slice(text.indexOf("\n") + 1 || text.length).trim();
    return (
      <section className={styles.body}>
        {rest ? <Prose markdown={rest} /> : null}
        <div className={styles.actions}>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setDraft(text);
              setEditing(true);
            }}
          >
            <Pencil size={13} aria-hidden /> Edit
          </Button>
        </div>
      </section>
    );
  }
  return (
    <section className={styles.body}>
      <MarkdownField
        value={draft}
        onChange={setDraft}
        onKeyDown={(e) => {
          if (isSubmit(e)) save();
          if (e.key === "Escape") cancel();
        }}
        minRows={6}
        label="Text"
        autoFocus
      />
      <Actions hint="Markdown · the first line is its title · Ctrl+Enter to save · Esc to cancel">
        <Button variant="outline" size="sm" onClick={cancel} disabled={pending}>
          Cancel
        </Button>
        <Button size="sm" onClick={save} disabled={pending || !draft.trim()}>
          Save
        </Button>
      </Actions>
    </section>
  );
}
