"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { createIssue } from "@/app/actions";
import { Button } from "@/components/ui/button";
import type { Ref } from "@/lib/data";
import { cn } from "@/lib/utils";
import { IssuePicker } from "./controls";
import { MarkdownField } from "./editors";
import { useIntent } from "./intents";
import styles from "./belay.module.css";

type Draft = { title: string; status: "todo" | "idea"; high: boolean; blockers: string[]; body: string };

const blank = (status: Draft["status"]): Draft => ({ title: "", status, high: false, blockers: [], body: "" });

/**
 * The + after the Issues · Ideas filter (grill Q10): a new todo, or an idea on Ideas. Closing keeps the draft until
 * it's created or discarded. The palette's New issue opens it too.
 */
export function CreateIssue({ project, status, candidates }: { project: string; status: Draft["status"]; candidates: Ref[] }) {
  const dialog = React.useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = React.useState(() => blank(status));
  const [error, setError] = React.useState<string>();
  const [pending, start] = React.useTransition();
  const set = (patch: Partial<Draft>) => {
    setError(undefined);
    setDraft((d) => ({ ...d, ...patch }));
  };
  const byId = new Map(candidates.map((r) => [r.id, r]));

  const open = () => {
    if (!draft.title && !draft.body && !draft.blockers.length) setDraft(blank(status));
    dialog.current?.showModal();
  };
  useIntent("new-issue", project, open);
  const submit = () => {
    if (pending) return;
    if (!draft.title.trim()) return setError("Give it a title");
    start(async () => {
      const r = await createIssue({ project, ...draft });
      if (r.error) return setError(r.error);
      setDraft(blank(status));
      dialog.current?.close();
    });
  };
  const discard = () => {
    setDraft(blank(status));
    dialog.current?.close();
  };

  return (
    <>
      <button type="button" className={styles.add} aria-label={status === "idea" ? "New idea" : "New issue"} title={status === "idea" ? "New idea" : "New issue"} onClick={open}>
        <Plus size={14} aria-hidden />
      </button>
      <dialog
        ref={dialog}
        className={cn(styles.dialog, styles.create)}
        aria-label="New issue"
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
            e.preventDefault();
            submit();
          }
        }}
      >
        <div className={styles.createRow}>
          <div className={styles.seg} role="group" aria-label="Status">
            {(["todo", "idea"] as const).map((s) => (
              <button key={s} type="button" aria-pressed={draft.status === s} onClick={() => set({ status: s })}>
                {s === "todo" ? "Todo" : "Idea"}
              </button>
            ))}
          </div>
          <span className={styles.muted}>in {project}</span>
          <button
            type="button"
            className={cn(styles.tool, draft.high && styles.toolOn)}
            aria-pressed={draft.high}
            title="High priority"
            aria-label="High priority"
            onClick={() => set({ high: !draft.high })}
          >
            !
          </button>
        </div>
        <input
          className={styles.createTitle}
          aria-label="Title"
          placeholder="Issue title"
          autoComplete="off"
          autoFocus
          value={draft.title}
          onChange={(e) => set({ title: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.ctrlKey && !e.metaKey) e.preventDefault();
          }}
        />
        <div className={styles.createRow}>
          <span className={styles.factLabel}>Blocked by</span>
          <IssuePicker
            label="Blocked by"
            value={draft.blockers.map((id) => byId.get(id) ?? { id })}
            onChange={(blockers) => set({ blockers })}
            candidates={candidates}
            preferProject={project}
            link={false}
          />
        </div>
        <MarkdownField value={draft.body} onChange={(body) => set({ body })} minRows={6} placeholder="Add a description…" />
        {error ? (
          <p className={styles.error} role="alert">
            {error}
          </p>
        ) : null}
        <div className={styles.dialogActions}>
          <span className={styles.hintLeft}>Ctrl ↵ create · Esc keeps the draft</span>
          <Button variant="outline" size="sm" onClick={discard} disabled={pending}>
            Discard
          </Button>
          <Button size="sm" onClick={submit} disabled={pending}>
            {draft.status === "idea" ? "Create idea" : "Create todo"}
          </Button>
        </div>
      </dialog>
    </>
  );
}
