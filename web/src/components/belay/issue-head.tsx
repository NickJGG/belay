"use client";

import * as React from "react";
import { Flag, MoreHorizontal } from "lucide-react";
import { keyCommand, STATUS_KEYS } from "../../../../src/keys.ts";
import type { Issue } from "../../../../src/store.ts";
import type { ExtensionId } from "../../../../src/extension-ids.ts";
import { openLinkedFile, removeIssue, setIssuePriority, setIssueStatus, setIssueTitle } from "@/app/actions";
import { PageHeader } from "@/components/layout/page-header";
import { PageCommands, type PageCommand } from "@/components/layout/palette";
import { useLive } from "@/components/live/live-provider";
import { activeClientSlots } from "@/lib/extensions.client";
import { projectHref } from "@/lib/hrefs";
import { cn } from "@/lib/utils";
import { Confirm, MenuButton, useAction, useOptimisticAction } from "./controls";
import { StatusIcon, statusName } from "./status-icon";
import styles from "./belay.module.css";

const NOT_TEXT = new Set(["checkbox", "radio", "button", "submit", "reset", "range", "color"]);

function focusKind(t: EventTarget | null): "text" | "control" | "none" {
  if (!(t instanceof HTMLElement)) return "none";
  if (t.isContentEditable || t.closest("textarea, select")) return "text";
  if (t instanceof HTMLInputElement) return NOT_TEXT.has(t.type) ? "control" : "text";
  return t.closest("a, button, summary") ? "control" : "none";
}

function TitleEdit({ id, title }: { id: string; title: string }) {
  const [editing, setEditing] = React.useState(false);
  const [shown, setShown] = useOptimisticAction(title, (t) => setIssueTitle(id, t));
  if (!editing) {
    return (
      <button type="button" className={styles.titleText} title="Edit title" onClick={() => setEditing(true)}>
        {shown}
      </button>
    );
  }
  const commit = (v: string) => {
    setEditing(false);
    if (v.trim() && v.trim() !== title) setShown(v.trim());
  };
  return (
    <input
      className={styles.titleInput}
      aria-label="Title"
      defaultValue={shown}
      autoFocus
      onFocus={(e) => e.currentTarget.select()}
      onBlur={(e) => commit(e.currentTarget.value)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") setEditing(false);
      }}
    />
  );
}

/**
 * The issue page's header: ‹, the status icon (belay's status menu, keys 1–5), the key, the title, a !
 * toggle for high priority (also the ! key), and ⋯ with the active extensions' actions (a grill's Open plan), Open
 * file and Delete. The palette lists the status and ! commands first while it's open.
 */
export function IssueHead({
  issue,
  ext,
  blocks,
}: {
  issue: Pick<Issue, "id" | "title" | "status" | "priority" | "project">;
  /** What each active extension's actions draw from. */
  ext: Partial<Record<ExtensionId, unknown>>;
  /** Issues it blocks, which deleting it unblocks. */
  blocks: { id: string; title?: string }[];
}) {
  const [status, setStatus] = useOptimisticAction(issue.status, (s) => setIssueStatus(issue.id, s));
  const [high, setHigh] = useOptimisticAction(issue.priority === "high", (h) => setIssuePriority(issue.id, h));
  const [statusOpen, setStatusOpen] = React.useState(false);
  const [deleting, setDeleting] = React.useState(false);
  const [pending, run] = useAction();
  const { active } = useLive();
  const actions = activeClientSlots(active).flatMap((s) => (s.id in ext ? (s.issueActions?.(issue.id, ext[s.id]) ?? []) : []));

  const onKey = React.useEffectEvent((e: KeyboardEvent) => {
    if (e.defaultPrevented || e.isComposing || document.querySelector("dialog[open]")) return;
    const focus = focusKind(e.target);
    if (e.key === "!" && focus !== "text" && !e.ctrlKey && !e.metaKey && !e.altKey) {
      e.preventDefault();
      setHigh(!high);
      return;
    }
    const cmd = keyCommand({ key: e.key, ctrl: e.ctrlKey, meta: e.metaKey, alt: e.altKey, focus });
    if (cmd?.kind !== "status") return;
    e.preventDefault();
    setStatusOpen(false);
    if (cmd.status !== status) setStatus(cmd.status);
  });
  React.useEffect(() => {
    const listener = (e: KeyboardEvent) => onKey(e);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  const commands: PageCommand[] = [
    ...STATUS_KEYS.filter((s) => s !== status).map((s) => ({
      id: s,
      label: `Set status: ${statusName(s)}`,
      icon: <StatusIcon status={s} />,
      shortcut: String(STATUS_KEYS.indexOf(s) + 1),
      run: () => setStatus(s),
    })),
    { id: "high", label: high ? "Remove high priority" : "Mark high priority", icon: <Flag size={14} aria-hidden />, shortcut: "!", run: () => setHigh(!high) },
  ];

  return (
    <>
      <PageCommands heading={`${issue.id} · ${issue.title}`} items={commands} />
      <PageHeader
        back={{
          href: projectHref(issue.project, issue.status === "idea" ? "?view=ideas" : ""),
          label: `${issue.project} ${issue.status === "idea" ? "ideas" : "issues"}`,
        }}
        title={
          <>
            <StatusMenu status={status} open={statusOpen} setOpen={setStatusOpen} onPick={(s) => s !== status && setStatus(s)} />
            <code className={styles.titleKey}>{issue.id}</code>
            <TitleEdit key={issue.title} id={issue.id} title={issue.title} />
          </>
        }
      >
        <button
          type="button"
          className={cn(styles.tool, high && styles.toolOn)}
          aria-pressed={high}
          title={high ? "High priority (!)" : "Mark high priority (!)"}
          aria-label="High priority"
          onClick={() => setHigh(!high)}
        >
          !
        </button>
        <MenuButton label="Issue actions" trigger={<MoreHorizontal size={18} aria-hidden />}>
          {(close) => (
            <>
              {actions.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  role="menuitem"
                  className={styles.menuItem}
                  onClick={() => {
                    close();
                    run(a.run);
                  }}
                >
                  {a.label}
                </button>
              ))}
              <button
                type="button"
                role="menuitem"
                className={styles.menuItem}
                onClick={() => {
                  close();
                  run(() => openLinkedFile(issue.id, "file"));
                }}
              >
                Open file
              </button>
              <hr className={styles.menuSep} />
              <button
                type="button"
                role="menuitem"
                className={cn(styles.menuItem, styles.menuBad)}
                onClick={() => {
                  close();
                  setDeleting(true);
                }}
              >
                Delete issue
              </button>
            </>
          )}
        </MenuButton>
      </PageHeader>
      <Confirm
        open={deleting}
        onClose={() => setDeleting(false)}
        title={`Delete ${issue.id}?`}
        action="Delete"
        pending={pending}
        onConfirm={() =>
          run(async () => {
            const r = await removeIssue(issue.id);
            if (r?.error) setDeleting(false);
            return r;
          })
        }
      >
        <p>This erases the issue file and can&apos;t be undone.</p>
        {blocks.length > 0 && (
          <>
            <p>It will be removed as a blocker from:</p>
            <ul>
              {blocks.map((d) => (
                <li key={d.id}>
                  <code>{d.id}</code> {d.title}
                </li>
              ))}
            </ul>
          </>
        )}
      </Confirm>
    </>
  );
}

function StatusMenu({
  status,
  open,
  setOpen,
  onPick,
}: {
  status: Issue["status"];
  open: boolean;
  setOpen: (open: boolean) => void;
  onPick: (s: Issue["status"]) => void;
}) {
  const label = `Status: ${statusName(status)} (1–5)`;
  return (
    <MenuButton label={label} className={styles.titleStatus} focus="[aria-checked=true]" open={open} setOpen={setOpen} trigger={<StatusIcon status={status} size={18} />}>
      {(close) =>
        STATUS_KEYS.map((s, i) => (
          <button
            key={s}
            type="button"
            role="menuitemradio"
            aria-checked={s === status}
            className={styles.menuItem}
            onClick={() => {
              close();
              onPick(s);
            }}
          >
            <StatusIcon status={s} />
            {statusName(s)}
            <kbd>{i + 1}</kbd>
          </button>
        ))
      }
    </MenuButton>
  );
}
