"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Popover } from "@/components/ui/popover";
import styles from "./note-popover.module.css";

/**
 * A popover holding one optional note: Enter submits, Shift+Enter is a newline. `onSubmit` gets the trimmed note
 * ("" when empty) and resolves true to clear it and close.
 */
export function NotePopover({
  open,
  onClose,
  trigger,
  label,
  title,
  placeholder,
  submitLabel,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  trigger: React.ReactNode;
  label: string;
  title: React.ReactNode;
  placeholder: string;
  submitLabel: (note: string) => string;
  onSubmit: (note: string) => Promise<boolean>;
}) {
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await onSubmit(note.trim());
    setBusy(false);
    if (ok) {
      setNote("");
      onClose();
    }
  };
  return (
    <Popover open={open} onClose={onClose} label={label} focus="textarea" trigger={trigger} panelClassName={styles.panel}>
      <form
        className={styles.form}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <b>{title}</b>
        <textarea
          value={note}
          rows={3}
          placeholder={placeholder}
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <span className={styles.acts}>
          <Button variant="outline" size="sm" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={busy}>
            {submitLabel(note.trim())}
          </Button>
        </span>
      </form>
    </Popover>
  );
}
