"use client";

import * as React from "react";
import { Columns2, Menu, MessageSquarePlus, Monitor, Smartphone } from "lucide-react";
import { Popover } from "@/components/ui/popover";
import { BEFORE, families, statusChip, type Controls, type Opt, type Question } from "../_lib/session-doc";
import { cn } from "@/lib/utils";
import shared from "@/components/session/session.module.css";
import styles from "./workspace.module.css";

export type Device = "desktop" | "phone";

export type PickProps = {
  label: string;
  disabled: boolean;
  why?: string;
  /** The option being picked, `key · name`. */
  what: string;
  open: boolean;
  onOpen: (open: boolean) => void;
  onPick: (note: string) => Promise<boolean>;
};

export type CommentProps = { on: boolean; disabled: boolean; why?: string; onToggle: () => void };

/** Pick opens a note field: Enter picks, a note ("but grey") is an amendment the skill makes a Yours variant of. */
function PickButton({ pick }: { pick: PickProps }) {
  const [note, setNote] = React.useState("");
  const [busy, setBusy] = React.useState(false);
  // Stable while the page re-renders (onOpen is a state setter), or the open popover would re-mount.
  const { onOpen } = pick;
  const close = React.useCallback(() => onOpen(false), [onOpen]);
  const submit = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await pick.onPick(note.trim());
    setBusy(false);
    if (ok) {
      setNote("");
      close();
    }
  };
  return (
    <Popover
      open={pick.open && !pick.disabled}
      onClose={close}
      label="Pick"
      focus="textarea"
      trigger={
        <button
          type="button"
          className={cn(shared.btn, styles.btn, shared.primary)}
          disabled={pick.disabled}
          title={pick.why ?? "Pick (P)"}
          aria-expanded={pick.open}
          onClick={() => pick.onOpen(!pick.open)}
        >
          {pick.label}
        </button>
      }
    >
      <form
        className={styles.pickForm}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <b>Pick {pick.what}</b>
        <textarea
          value={note}
          rows={3}
          placeholder="Add a note (optional), e.g. “but grey”"
          onChange={(e) => setNote(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
        />
        <span className={styles.pickActs}>
          <button type="button" className={cn(shared.btn, styles.btn)} onClick={close}>
            Cancel
          </button>
          <button type="submit" className={cn(shared.btn, styles.btn, shared.primary)} disabled={busy}>
            {note.trim() ? "Pick with note" : "Pick"}
          </button>
        </span>
      </form>
    </Popover>
  );
}

/** A segmented toggle; an item's third entry is an icon, which then stands in for its label (kept as the tooltip). */
function Seg<T extends string | number | boolean>({
  label,
  items,
  value,
  onPick,
}: {
  label: string;
  items: [T, string, React.ReactNode?][];
  value: T;
  onPick: (v: T) => void;
}) {
  return (
    <span className={styles.lgrp}>
      <span className={styles.lbl} aria-hidden>
        {label}
      </span>
      <span className={cn(styles.seg, items.some(([, , i]) => i) && styles.icons)} role="group" aria-label={label}>
        {items.map(([v, l, icon]) => (
          <button
            key={String(v)}
            type="button"
            className={cn(String(v) === String(value) && styles.on)}
            aria-pressed={String(v) === String(value)}
            title={icon ? l : undefined}
            aria-label={icon ? l : undefined}
            onClick={() => onPick(v)}
          >
            {icon ?? l}
          </button>
        ))}
      </span>
    </span>
  );
}

function OptButton({ q, o, on, kid, onPick }: { q: Question; o: Opt; on: boolean; kid?: boolean; onPick: () => void }) {
  return (
    <button
      type="button"
      className={cn(on && styles.on, o.key === q.rec && styles.rec, o.out && styles.out, kid && styles.kid)}
      aria-pressed={on}
      title={o.expl}
      onClick={onPick}
    >
      <b>{o.key}</b> {o.name}
      {o.key === q.rec ? <u>rec</u> : null}
      {o.key === q.pick ? <u className={styles.tagPicked}>✓</u> : null}
      {o.yours ? <u className={styles.tagYours}>Yours</u> : null}
      {o.current ? <u className={styles.tagCurrent}>Current</u> : null}
    </button>
  );
}

/** Before, then each option family as one pill: the root, then every variant in its well. Flows and wraps like text. */
export function OptionSelector({
  q,
  value,
  before,
  onPick,
}: {
  q: Question;
  value: string;
  before: boolean;
  onPick: (key: string) => void;
}) {
  const opt = (o: Opt, kid?: boolean) => <OptButton key={o.key} q={q} o={o} on={value === o.key} kid={kid} onPick={() => onPick(o.key)} />;
  return (
    <div className={styles.opts} role="group" aria-label="Option">
      {before ? (
        <span className={styles.fam}>
          <button type="button" className={cn(value === BEFORE && styles.on)} aria-pressed={value === BEFORE} onClick={() => onPick(BEFORE)}>
            Before
          </button>
        </span>
      ) : null}
      {families(q).map(({ root, kids }) => (
        <span key={root.key} className={styles.fam}>
          {/* The root and its first variant never split across lines. */}
          <span className={styles.famHead}>
            {opt(root)}
            {kids.length ? opt(kids[0], true) : null}
          </span>
          {kids.slice(1).map((k) => opt(k, true))}
        </span>
      ))}
    </div>
  );
}

/** A resolved question's answer, clamped to one line with More while it overflows. Keyed by question, so it closes on a switch. */
function Answer({ text }: { text: string }) {
  const [open, setOpen] = React.useState(false);
  const [clipped, setClipped] = React.useState(false);
  const ref = React.useRef<HTMLDivElement>(null);
  React.useLayoutEffect(() => {
    const el = ref.current;
    if (!el || open) return;
    const measure = () => setClipped(el.scrollWidth > el.clientWidth || text.includes("\n"));
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [text, open]);
  return (
    <div className={styles.answerRow}>
      <div ref={ref} className={cn(styles.answer, !open && styles.clamped)}>
        <b>Your answer:</b> {text}
      </div>
      {open || clipped ? (
        <button type="button" className={styles.more} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
          {open ? "Less" : "More"}
        </button>
      ) : null}
    </div>
  );
}

/** The phone's way to the questions, where the Outline isn't shown: "Qn of N" opens its rows in a sheet. */
function OutlineMenu({ label, children }: { label: string; children: React.ReactNode }) {
  const [open, setOpen] = React.useState(false);
  const close = React.useCallback(() => setOpen(false), []);
  return (
    <span className={styles.menu}>
      <Popover
        open={open}
        onClose={close}
        label="Outline"
        focus="[aria-current], a[href]"
        trigger={
          <button type="button" className={cn(shared.btn, styles.btn)} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
            <Menu size={14} aria-hidden /> {label}
          </button>
        }
      >
        {/* A view row navigates, so it closes the sheet; an option row only switches the option. */}
        <div onClick={(e) => (e.target as Element).closest("a") && close()}>{children}</div>
      </Popover>
    </span>
  );
}

export function Bar({
  title,
  q,
  opt,
  onOpt,
  mocked,
  controls,
  controlKeys,
  chosen,
  onControl,
  device,
  onDevice,
  compare,
  onCompare,
  pick,
  comment,
  outline,
  total,
}: {
  title: string;
  q: Question | null;
  opt: string;
  onOpt: (key: string) => void;
  /** The stage draws this view's mock: offers Before, the device and compare. */
  mocked: boolean;
  controls: Controls;
  controlKeys: string[];
  chosen: Record<string, unknown>;
  onControl: (k: string, v: unknown) => void;
  device: Device;
  onDevice: (d: Device) => void;
  compare: boolean;
  onCompare: () => void;
  pick: PickProps | null;
  comment: CommentProps | null;
  /** The Outline's rows, for the phone's menu. */
  outline: React.ReactNode;
  total: number;
}) {
  const chip = q ? statusChip(q) : null;
  const opts = q && q.opts?.length ? q : null;
  const compareOn = mocked && !!opts;
  const decide = !!(comment || pick);
  return (
    <div className={styles.bar}>
      <div className={styles.top}>
        <OutlineMenu label={q ? `Q${q.n} of ${total}` : `${total} questions`}>{outline}</OutlineMenu>
        {q ? <span className={styles.qbadge}>Q{q.n}</span> : null}
        <div className={cn(styles.tt, q?.answer && styles.ttWide)}>
          <div className={styles.tline}>
            <h1 className={styles.title} title={title}>
              {title}
            </h1>
            {chip ? (
              chip.see ? (
                <a href={`#q-${chip.see}`} className={cn(styles.chip, styles[`chip-${chip.tone}`])}>
                  {chip.text}
                </a>
              ) : (
                <span className={cn(styles.chip, styles[`chip-${chip.tone}`])}>{chip.text}</span>
              )
            ) : null}
          </div>
          {/* Notes and answers are the skill's own HTML (e.g. <b>Player</b>), as the old preview showed them. */}
          {q?.note && !q.answer ? <div className={styles.note} dangerouslySetInnerHTML={{ __html: q.note }} /> : null}
          {q?.answer ? <Answer key={q.n} text={q.answer} /> : null}
        </div>
      </div>
      {mocked || decide ? (
        <span className={styles.acts}>
          {mocked ? (
            <Seg<Device>
              label="Device"
              items={[
                ["desktop", "Desktop", <Monitor key="d" size={14} aria-hidden />],
                ["phone", "Phone", <Smartphone key="p" size={14} aria-hidden />],
              ]}
              value={device}
              onPick={onDevice}
            />
          ) : null}
          {compareOn ? (
            <button type="button" className={cn(shared.btn, styles.btn, compare && shared.btnOn)} aria-pressed={compare} onClick={onCompare} title="Compare (Shift+letter pins the other side)">
              <Columns2 size={14} aria-hidden /> Compare
            </button>
          ) : null}
          {mocked && decide ? <span className={styles.sep} aria-hidden /> : null}
          {comment ? (
            <button
              type="button"
              className={cn(shared.btn, styles.btn, comment.on && shared.btnOn)}
              aria-pressed={comment.on}
              disabled={comment.disabled}
              title={comment.why ?? (comment.on ? "Click an element in the mock (Esc to stop)" : "Comment on an element of the mock")}
              onClick={comment.onToggle}
            >
              <MessageSquarePlus size={14} aria-hidden /> Comment
            </button>
          ) : null}
          {pick ? <PickButton pick={pick} /> : null}
        </span>
      ) : null}
      {opts ? (
        <div className={cn(styles.tools, styles.optsRow)}>
          <OptionSelector q={opts} value={opt} before={mocked} onPick={onOpt} />
        </div>
      ) : null}
      {controlKeys.length ? (
        <div className={cn(styles.tools, styles.ctls)}>
          {controlKeys.map((k) => (
            <Seg
              key={k}
              label={controls[k].label}
              items={controls[k].items.map(([v, l]) => [String(v), l] as [string, string])}
              value={String(chosen[k] ?? controls[k].def)}
              onPick={(v) => onControl(k, controls[k].items.find(([x]) => String(x) === v)?.[0] ?? v)}
            />
          ))}
        </div>
      ) : null}
    </div>
  );
}
