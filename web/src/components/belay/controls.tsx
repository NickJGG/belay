"use client";
/** Belay's editing controls. Each write goes through a server action and toasts its error. */
import * as React from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { pickerOptions } from "../../../../src/picker.ts";
import type { Result } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Popover } from "@/components/ui/popover";
import type { Ref } from "@/lib/data";
import { issueHref } from "@/lib/hrefs";
import { cn } from "@/lib/utils";
import { StatusIcon } from "./status-icon";
import { toastError } from "./toaster";
import styles from "./belay.module.css";

/** A value that flips the moment it's set and reverts if the write fails. */
export function useOptimisticAction<T>(value: T, action: (v: T) => Promise<Result>): [T, (v: T) => void] {
  const [shown, setShown] = React.useOptimistic(value);
  const [, start] = React.useTransition();
  const set = (v: T) =>
    start(async () => {
      setShown(v);
      const r = await action(v);
      if (r.error) toastError(r.error);
    });
  return [shown, set];
}

/** Runs a server action in a transition, toasting its error. */
export function useAction(): [boolean, (action: () => Promise<Result | undefined>) => void] {
  const [pending, start] = React.useTransition();
  const run = (action: () => Promise<Result | undefined>) =>
    start(async () => {
      const r = await action();
      if (r?.error) toastError(r.error);
    });
  return [pending, run];
}

/** Text that saves itself on blur or Enter; Escape puts it back. Keyed on `value`, so a save from elsewhere replaces it. */
export function TextEdit({
  value,
  label,
  placeholder,
  save,
  className,
}: {
  value: string;
  label: string;
  placeholder?: string;
  save: (v: string) => Promise<Result>;
  className?: string;
}) {
  const [, start] = React.useTransition();
  const commit = (el: HTMLInputElement) => {
    if (el.value.trim() === value) return;
    start(async () => {
      const r = await save(el.value);
      if (r.error) {
        toastError(r.error);
        el.value = value;
      }
    });
  };
  return (
    <input
      key={value}
      className={cn(styles.textEdit, className)}
      aria-label={label}
      placeholder={placeholder}
      defaultValue={value}
      onBlur={(e) => commit(e.currentTarget)}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        if (e.key === "Escape") {
          e.currentTarget.value = value;
          e.currentTarget.blur();
        }
      }}
    />
  );
}

/** An issue reference. `link={false}` where navigating away would lose state, as in a dialog. */
export function Chip({ r, onRemove, link = true }: { r: Ref; onRemove?: () => void; link?: boolean }) {
  const body = (
    <>
      {r.status ? <StatusIcon status={r.status} size={12} /> : <span className={styles.muted}>?</span>}
      {r.id}
    </>
  );
  const title = r.title ?? "missing issue";
  return (
    <span className={styles.chip}>
      {link ? (
        <Link href={issueHref(r.id)} className={styles.chipBody} title={title}>
          {body}
        </Link>
      ) : (
        <span className={styles.chipBody} title={title}>
          {body}
        </span>
      )}
      {onRemove && (
        <button type="button" className={styles.chipX} aria-label={`Remove ${r.id}`} onClick={onRemove}>
          <X size={11} />
        </button>
      )}
    </span>
  );
}

/**
 * An editable combobox that picks issues into chips (the WAI-ARIA APG pattern): focus stays in the input while
 * the list tracks its active option through aria-activedescendant.
 */
export function IssuePicker({
  label,
  value,
  onChange,
  candidates,
  preferProject,
  link,
  disabled,
}: {
  label: string;
  value: Ref[];
  onChange: (ids: string[]) => void;
  candidates: Ref[];
  preferProject?: string;
  link?: boolean;
  disabled?: boolean;
}) {
  const id = React.useId();
  const ul = React.useRef<HTMLUListElement>(null);
  const [query, setQuery] = React.useState("");
  const [open, setOpen] = React.useState(false);
  const [active, setActive] = React.useState(0);
  const ids = value.map((r) => r.id);
  const options = open ? pickerOptions(candidates, query, { exclude: ids, preferProject }) : [];
  const shown = options.length > 0;

  React.useEffect(() => {
    if (shown) ul.current?.children[active]?.scrollIntoView({ block: "nearest" });
  }, [shown, active]);

  const show = () => {
    setActive(0);
    setOpen(true);
  };
  const add = (r: Ref) => {
    onChange([...ids, r.id]);
    setQuery("");
    setActive(0);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === "ArrowDown") {
      if (!open) show();
      else setActive(Math.min(active + 1, options.length - 1));
    } else if (e.key === "ArrowUp" && shown) setActive(Math.max(active - 1, 0));
    else if (e.key === "Enter" && shown) add(options[Math.min(active, options.length - 1)]);
    else if (e.key === "Escape" && shown) setOpen(false);
    else if (e.key === "Backspace" && !query && ids.length) onChange(ids.slice(0, -1));
    else return;
    e.preventDefault();
    e.stopPropagation();
  };

  return (
    <div className={styles.picker}>
      {value.map((r) => (
        <Chip key={r.id} r={r} link={link} onRemove={disabled ? undefined : () => onChange(ids.filter((x) => x !== r.id))} />
      ))}
      <input
        role="combobox"
        className={styles.pickerInput}
        placeholder="Add…"
        aria-label={label}
        aria-autocomplete="list"
        aria-expanded={shown}
        aria-controls={shown ? `${id}-list` : undefined}
        aria-activedescendant={shown ? `${id}-${active}` : undefined}
        autoComplete="off"
        value={query}
        disabled={disabled}
        onChange={(e) => {
          setQuery(e.target.value);
          show();
        }}
        onClick={show}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
      />
      {shown && (
        // mousedown would blur the input and close the list before the click lands.
        <ul ref={ul} id={`${id}-list`} role="listbox" aria-label={label} className={styles.list} onMouseDown={(e) => e.preventDefault()}>
          {options.map((r, i) => (
            <li
              key={r.id}
              id={`${id}-${i}`}
              role="option"
              aria-selected={i === active}
              className={styles.option}
              onMouseMove={() => setActive(i)}
              onClick={() => add(r)}
            >
              {r.status && <StatusIcon status={r.status} size={12} />}
              <span className={styles.key}>{r.id}</span>
              <span>{r.title}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** A title-row icon button that opens a menu in a popover. Pass `open` and `setOpen` to hold its state. */
export function MenuButton({
  label,
  trigger,
  className,
  focus = "[aria-checked=true], [role=menuitem], [role=menuitemradio], input",
  open: held,
  setOpen: setHeld,
  children,
}: {
  label: string;
  trigger: React.ReactNode;
  className?: string;
  /** What opening focuses first. */
  focus?: string;
  open?: boolean;
  setOpen?: (open: boolean) => void;
  children: (close: () => void) => React.ReactNode;
}) {
  const [own, setOwn] = React.useState(false);
  const open = held ?? own;
  const setOpen = setHeld ?? setOwn;
  const close = React.useCallback(() => setOpen(false), [setOpen]);
  return (
    <Popover
      open={open}
      onClose={close}
      label={label}
      focus={focus}
      trigger={
        <button
          type="button"
          className={className ?? styles.tool}
          aria-label={label}
          title={label}
          aria-haspopup="menu"
          aria-expanded={open}
          onClick={() => setOpen(!open)}
        >
          {trigger}
        </button>
      }
    >
      <div className={styles.menu} role="menu" aria-label={label}>
        {children(close)}
      </div>
    </Popover>
  );
}

/** A modal asking before something that can't be undone. */
export function Confirm({
  open,
  onClose,
  title,
  action,
  pending,
  onConfirm,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  action: string;
  pending: boolean;
  onConfirm: () => void;
  children: React.ReactNode;
}) {
  const dialog = React.useRef<HTMLDialogElement>(null);
  React.useEffect(() => {
    const d = dialog.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog ref={dialog} className={styles.dialog} aria-label={title} onClose={onClose}>
      <h2 className={styles.dialogTitle}>{title}</h2>
      <div className={styles.dialogBody}>{children}</div>
      <div className={styles.dialogActions}>
        {/* autoFocus: showModal() focuses it, so Enter right after opening cancels. */}
        <Button variant="outline" size="sm" autoFocus onClick={onClose} disabled={pending}>
          Cancel
        </Button>
        <Button variant="outline" size="sm" className={styles.danger} onClick={onConfirm} disabled={pending}>
          {action}
        </Button>
      </div>
    </dialog>
  );
}
