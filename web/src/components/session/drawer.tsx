"use client";

import * as React from "react";
import { ChevronRight, ImageIcon, MessageSquare, Paperclip, SendHorizontal, SquareTerminal, User, X } from "lucide-react";
import { Prose } from "@/components/content/prose";
import { Mark } from "@/components/layout/logo";
import { IMAGE_TYPES, MAX_IMAGE_BYTES, MAX_IMAGES } from "@/lib/images";
import { openPrompts, permissionLine, permView, placeSteps, toolLabel, toStep, type ChatEntry, type OpenTurn, type Step } from "@/lib/chat";
import type { MarkdownContext } from "@/lib/markdown";
import type { ClientKind, Composer } from "@/lib/session-kind";
import type { Usage } from "@/lib/usage";
import { cn } from "@/lib/utils";
import styles from "./session.module.css";
import { CacheRing, UsagePills } from "./usage";

export type Send = (msg: Record<string, unknown>) => Promise<string | null>;

/** Where the drawer stands: answerable, or why it isn't. */
export type LinkState = { state: "connected"; working: boolean } | { state: "disconnected" } | { state: "offline" };

export const str = (v: unknown) => (typeof v === "string" ? v : "");

export const imagesOf = (e: ChatEntry) => (Array.isArray(e.images) ? e.images.filter((n): n is string => typeof n === "string") : []);

/** A picture in the composer's tray: uploading, stored as `name`, or failed. `url` is its object URL. */
type Pic = { id: number; name?: string; url: string; state: "busy" | "done" | "fail" };

const imageUrl = (slug: string, name: string) => `/api/s/${slug}/images/${encodeURIComponent(name)}`;

/** A sent message's pictures, above its bubble; each opens full size. */
export function SentPics({ slug, names }: { slug: string; names: string[] }) {
  if (!names.length) return null;
  return (
    <div className={cn(styles.sentPics, names.length === 1 && styles.sentOne)}>
      {names.map((n) => (
        <a
          key={n}
          href={imageUrl(slug, n)}
          target="_blank"
          rel="noreferrer"
          className={styles.sentPic}
          style={{ backgroundImage: `url("${imageUrl(slug, n)}")` }}
          aria-label="Open the picture"
        />
      ))}
    </div>
  );
}

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const count = (n: number) => `${n} ${n === 1 ? "step" : "steps"}`;

/** Re-renders every second while `on`, for the live group's timer. */
function useNow(on: boolean) {
  const [now, setNow] = React.useState(() => Date.now());
  React.useEffect(() => {
    if (!on) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [on]);
  return now;
}

/**
 * One node on the rail: verb, target chip, detail, then meta; `now` is the live newest. An old step without parts
 * draws its label.
 */
function StepRow({ step, now }: { step: Step; now?: boolean }) {
  return (
    <div className={cn(styles.step, now && styles.stepNow, step.tone === "bad" && styles.stepBad)}>
      <i className={styles.stepNode} aria-hidden />
      {step.verb ? (
        <>
          <span className={styles.stepVerb}>{step.verb}</span>
          {step.target ? <span className={styles.stepTarget}>{step.target}</span> : null}
          {step.detail ? <span className={styles.stepTail}>{step.detail}</span> : null}
        </>
      ) : (
        <span className={styles.stepTail}>{step.label}</span>
      )}
      {step.meta ? <span className={cn(styles.stepMeta, step.tone && styles[step.tone])}>· {step.meta}</span> : null}
      {now ? "…" : null}
    </div>
  );
}

function Failed({ steps }: { steps: Step[] }) {
  const n = steps.filter((s) => s.tone === "bad").length;
  return n ? <span className={styles.bad}>· {n} failed</span> : null;
}

/** A finished turn's steps, folded to one line that opens the list. */
function StepGroup({ steps, ms, interrupted }: { steps: Step[]; ms: number; interrupted: boolean }) {
  const [open, setOpen] = React.useState(false);
  return (
    <div className={styles.group}>
      <button type="button" className={styles.groupHead} onClick={() => setOpen((o) => !o)} aria-expanded={open}>
        {open ? "▾" : "▸"} {count(steps.length)} · {clock(ms)}
        <Failed steps={steps} />
        {interrupted ? <span className={styles.groupInt}>· interrupted</span> : null}
      </button>
      {open ? (
        <div className={styles.stepRail}>
          {steps.map((s, i) => (
            <StepRow key={i} step={s} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Claude's turn in progress: its steps so far, listed open, with a ticking timer. */
function LiveGroup({ turn }: { turn: OpenTurn | null }) {
  const now = useNow(true);
  const steps = turn?.steps ?? [];
  const start = turn ? Date.parse(turn.start) : NaN;
  return (
    <div className={styles.group} role="status">
      <span className={styles.groupHead}>
        <i className={styles.dot} aria-hidden />
        {steps.length ? `Working · ${count(steps.length)}${Number.isNaN(start) ? "" : ` · ${clock(now - start)}`}` : "Working…"}
        <Failed steps={steps} />
      </span>
      {steps.length ? (
        <div className={styles.stepRail}>
          {steps.map((s, i) => (
            <StepRow key={i} step={s} now={i === steps.length - 1} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** The tag row: your avatar or Claude's mark, a bold name, and a faint suffix. */
export function Speaker({ me, name, extra, className }: { me?: boolean; name: React.ReactNode; extra?: string; className?: string }) {
  return (
    <span className={cn(styles.tag, className)}>
      {me ? (
        <span className={styles.avatar} aria-hidden>
          <User size={10} strokeWidth={2.5} />
        </span>
      ) : (
        <Mark className={styles.tagMark} />
      )}
      <span>
        <b className={styles.tagName}>{name}</b>
        {extra ? <> · {extra}</> : null}
      </span>
    </span>
  );
}

function Entry({
  slug,
  e,
  all,
  open,
  link,
  send,
  md,
  kinds,
}: {
  slug: string;
  e: ChatEntry;
  all: ChatEntry[];
  open: ReturnType<typeof openPrompts>;
  link: LinkState;
  send: Send;
  /** Its kind's Markdown context: a lesson's course, so Claude's citations render as claim chips. */
  md?: MarkdownContext;
  /** Every active kind draws its own entries, whichever kind the session is. */
  kinds: ClientKind[];
}) {
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const act = async (msg: Record<string, unknown>) => {
    setBusy(true);
    setError(null);
    const err = await send(msg);
    setBusy(false);
    if (err) setError(err);
  };
  const live = link.state === "connected";

  for (const k of kinds) {
    const own = k.entry?.(e, { slug, md });
    if (own !== undefined) return own;
  }
  if (e.from === "claude" && e.kind === "steps") {
    const steps = Array.isArray(e.steps) ? e.steps.map(toStep) : [];
    return <StepGroup steps={steps} ms={Number(e.ms) || 0} interrupted={e.interrupted === true} />;
  }
  if (e.from === "claude" && (e.kind === "reply" || e.kind === "terminal")) {
    const text = str(e.text);
    return (
      <div className={cn(styles.msg, styles.claude)}>
        <Speaker name="Claude" extra={e.kind === "terminal" ? "terminal" : undefined} />
        <div className={styles.bubble}>
          <Prose markdown={text} context={md} compact className={styles.msgProse} />
        </div>
      </div>
    );
  }
  if (e.kind === "chat" && (e.from === "site" || e.from === "terminal")) {
    return (
      <div className={cn(styles.msg, styles.me)}>
        <Speaker me name="You" extra={e.from === "terminal" ? "terminal" : undefined} />
        <SentPics slug={slug} names={imagesOf(e)} />
        {str(e.text) ? (
          <div className={styles.bubble}>
            <Prose markdown={str(e.text)} compact className={styles.msgProse} />
          </div>
        ) : null}
      </div>
    );
  }
  if (e.from === "claude" && e.kind === "choice") {
    const id = str(e.id);
    const answer = all.find((x) => x.from === "site" && x.kind === "choice" && x.id === id);
    const can = live && open.choices.has(id) && !busy;
    const options = Array.isArray(e.options) ? (e.options as unknown[]).map(String) : [];
    return (
      <div className={cn(styles.msg, styles.claude)}>
        <Speaker name="Claude asks" />
        <div className={styles.bubble}>
          <Prose markdown={str(e.prompt)} compact className={styles.msgProse} />
          <div className={styles.choices}>
            {options.map((o) => (
              <button
                key={o}
                type="button"
                className={cn(styles.btn, answer?.option === o && styles.btnOn)}
                disabled={!can}
                onClick={() => act({ kind: "choice", id, option: o })}
              >
                {o}
              </button>
            ))}
          </div>
          {!answer && !open.choices.has(id) ? <p className={styles.dim}>Answered in the terminal.</p> : null}
          {error ? <p className={styles.err}>{error}</p> : null}
        </div>
      </div>
    );
  }
  if (e.from === "claude" && e.kind === "permission") {
    const id = str(e.request_id);
    const verdict = all.find((x) => x.from === "site" && x.kind === "permission" && x.request_id === id);
    const line = permissionLine(str(e.tool_name), str(e.description));
    if (verdict || !open.permissions.has(id)) {
      const allowed = verdict?.behavior === "allow";
      return (
        <div className={cn(styles.msg, styles.claude)}>
          <Speaker name={`Permission · ${toolLabel(str(e.tool_name)).label}`} />
          <div className={cn(styles.bubble, verdict ? (allowed ? styles.bubbleAllowed : styles.bubbleDenied) : null)}>
            {verdict ? (
              <p className={allowed ? styles.verdictAllowed : styles.verdictDenied}>{allowed ? "Approved" : "Denied"}</p>
            ) : (
              <p className={styles.dim}>Answered in the terminal.</p>
            )}
          </div>
        </div>
      );
    }
    return (
      <div className={cn(styles.msg, styles.claude)}>
        <Speaker name={`Permission · ${toolLabel(str(e.tool_name)).label}`} />
        <div className={cn(styles.bubble, styles.bubblePerm)}>
          {e.mode === "plan" ? <p className={styles.permMode}>Asked because plan mode is on: it checks every tool that isn&apos;t read-only.</p> : null}
          {line ? <p>{line}</p> : null}
          {str(e.input_preview) ? <PermInput name={str(e.tool_name)} raw={str(e.input_preview)} /> : null}
          <div className={styles.choices}>
            <button type="button" className={cn(styles.btn, styles.primary)} disabled={!live || busy} onClick={() => act({ kind: "permission", request_id: id, behavior: "allow" })}>
              Allow
            </button>
            <button type="button" className={styles.btn} disabled={!live || busy} onClick={() => act({ kind: "permission", request_id: id, behavior: "deny" })}>
              Deny
            </button>
          </div>
          {error ? <p className={styles.err}>{error}</p> : null}
        </div>
      </div>
    );
  }
  if (e.from === "site" && e.kind === "choice") {
    const names = imagesOf(e);
    return (
      <>
        <div className={styles.event}>You answered: {str(e.option) || str(e.text)}</div>
        {names.length ? (
          <div className={cn(styles.msg, styles.me)}>
            <SentPics slug={slug} names={names} />
          </div>
        ) : null}
      </>
    );
  }
  return null;
}

const diffLines = (text: string, mark: string) =>
  text
    .split("\n")
    .map((l) => `${mark} ${l}`)
    .join("\n");

/** A pending permission's tool input, shaped by tool (`permView`). */
function PermInput({ name, raw }: { name: string; raw: string }) {
  const v = permView(name, raw);
  switch (v.kind) {
    case "markdown":
      return (
        <div className={styles.permInset}>
          <Prose markdown={v.text} compact className={styles.msgProse} />
          {v.options?.length ? (
            <div className={styles.permChips}>
              {v.options.map((o) => (
                <span key={o} className={styles.permChip}>
                  {o}
                </span>
              ))}
            </div>
          ) : null}
        </div>
      );
    case "command":
      return <pre className={styles.permCmd}>{v.command}</pre>;
    case "edit":
      return (
        <>
          <div className={styles.permPath}>{v.path}</div>
          <pre className={styles.permDiff}>
            {v.oldText ? <span className={styles.permDel}>{`${diffLines(v.oldText, "−")}\n`}</span> : null}
            <span className={styles.permAdd}>{diffLines(v.newText, "+")}</span>
          </pre>
        </>
      );
    case "fields":
      return (
        <div className={styles.permFields}>
          {v.fields.map(([k, val]) => (
            <div key={k}>
              <div className={styles.permKey}>{k}</div>
              <div className={styles.permVal}>{val}</div>
            </div>
          ))}
        </div>
      );
    case "raw":
      return <pre className={styles.preview}>{v.text}</pre>;
  }
}

export function Drawer({
  slug,
  md,
  kind,
  kinds,
  chat,
  liveTurn,
  usage,
  link,
  send,
  open,
  onOpen,
  width,
  onWidth,
  composer,
  onFocusTerminal,
  sheet,
  onSheet,
}: {
  slug: string;
  /** Its kind's Markdown context. */
  md?: MarkdownContext;
  /** The session's kind, and every active one. */
  kind: ClientKind;
  kinds: ClientKind[];
  chat: ChatEntry[];
  liveTurn: OpenTurn | null;
  usage: Usage | null;
  link: LinkState;
  send: Send;
  open: boolean;
  onOpen: (open: boolean) => void;
  width: number;
  onWidth: (w: number) => void;
  composer: Composer | null;
  /** Raises the session's terminal tab; unset hides the button. */
  onFocusTerminal?: () => void;
  /** The narrow layout's full-screen sheet, opened from the Strip. */
  sheet: boolean;
  onSheet: (open: boolean) => void;
}) {
  const prompts = React.useMemo(() => openPrompts(chat), [chat]);
  const shown = React.useMemo(() => placeSteps(chat), [chat]);
  const pendingChoice = [...prompts.choices].at(-1) ?? null;
  const [text, setText] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [sending, setSending] = React.useState(false);
  const scroller = React.useRef<HTMLDivElement>(null);
  const input = React.useRef<HTMLTextAreaElement>(null);
  const picker = React.useRef<HTMLInputElement>(null);
  const [pics, setPics] = React.useState<Pic[]>([]);
  const [dropping, setDropping] = React.useState(false);
  const nextPic = React.useRef(0);
  // Removed mid-upload: its name, once it arrives, is deleted rather than shown.
  const dropped = React.useRef(new Set<number>());
  const picsNow = React.useRef(pics);
  React.useEffect(() => {
    picsNow.current = pics;
  }, [pics]);
  React.useEffect(() => () => picsNow.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  React.useEffect(() => {
    if (composer) input.current?.focus();
  }, [composer]);
  const stuck = React.useRef(true);

  // Unread: Claude's messages that arrived while the drawer was shut.
  const fromClaude = chat.filter((e) => e.from === "claude" && e.kind !== "steps").length;
  const [seen, setSeen] = React.useState(fromClaude);
  if (open && seen !== fromClaude) setSeen(fromClaude);
  const unread = open ? 0 : Math.max(0, fromClaude - seen);

  React.useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [text, open]);

  React.useLayoutEffect(() => {
    const el = scroller.current;
    if (el && stuck.current) el.scrollTop = el.scrollHeight;
  }, [chat, open, liveTurn]);

  const deletePic = (name: string) => void fetch(imageUrl(slug, name), { method: "DELETE" }).catch(() => {});

  const upload = async (id: number, f: File) => {
    let name: string | undefined;
    try {
      const res = await fetch(`/api/s/${slug}/images`, { method: "POST", headers: { "Content-Type": f.type }, body: f });
      if (res.ok) name = str((await res.json()).name) || undefined;
    } catch {}
    if (dropped.current.delete(id)) {
      if (name) deletePic(name);
      return;
    }
    setPics((ps) => ps.map((p) => (p.id === id ? { ...p, name, state: name ? "done" : "fail" } : p)));
  };

  const addFiles = (files: File[]) => {
    const refused: string[] = [];
    let room = MAX_IMAGES - pics.length;
    for (const f of files) {
      if (!IMAGE_TYPES[f.type]) refused.push(`${f.name || "That file"}: PNG, JPEG, GIF or WebP only.`);
      else if (f.size > MAX_IMAGE_BYTES) refused.push(`${f.name || "That picture"} is over 10 MB.`);
      else if (room <= 0) {
        refused.push(`Up to ${MAX_IMAGES} pictures per message.`);
        break;
      } else {
        room--;
        const id = nextPic.current++;
        setPics((ps) => [...ps, { id, url: URL.createObjectURL(f), state: "busy" }]);
        void upload(id, f);
      }
    }
    setError(refused.length ? refused.join(" ") : null);
  };

  const removePic = (pic: Pic) => {
    URL.revokeObjectURL(pic.url);
    setPics((ps) => ps.filter((p) => p.id !== pic.id));
    if (pic.state === "busy") dropped.current.add(pic.id);
    else if (pic.name) deletePic(pic.name);
  };

  const uploading = pics.some((p) => p.state === "busy");
  const names = pics.flatMap((p) => (p.name ? [p.name] : []));
  // Q5: only a plain chat may be pictures alone; a kind's message (a comment) or a typed answer still needs its text.
  const canSend = !!text.trim() || (!composer && !pendingChoice && names.length > 0);

  const submit = async () => {
    const t = text.trim();
    if (!canSend || sending || uploading) return;
    if (pics.some((p) => p.state === "fail")) return setError("Remove the failed picture first.");
    setSending(true);
    setError(null);
    const images = names.length ? { images: names } : {};
    // Q14: while a choice is up, typed text answers it.
    const err = await send(
      composer
        ? { ...composer.message(t), ...images }
        : pendingChoice
          ? { kind: "choice", id: pendingChoice, text: t, ...images }
          : { kind: "chat", text: t, ...images },
    );
    setSending(false);
    if (err) setError(err);
    else {
      setText("");
      pics.forEach((p) => URL.revokeObjectURL(p.url));
      setPics([]);
      composer?.cancel();
    }
  };

  const startDrag = (e: React.PointerEvent) => {
    e.preventDefault();
    const x0 = e.clientX;
    const w0 = width;
    const move = (m: PointerEvent) => onWidth(Math.min(760, Math.max(320, w0 + x0 - m.clientX)));
    const up = () => {
      removeEventListener("pointermove", move);
      removeEventListener("pointerup", up);
      document.body.classList.remove(styles.dragging);
    };
    document.body.classList.add(styles.dragging);
    addEventListener("pointermove", move);
    addEventListener("pointerup", up);
  };

  const live = link.state === "connected";
  if (!open && !sheet) {
    return (
      <button type="button" className={styles.strip} onClick={() => onOpen(true)} aria-label="Open the conversation">
        {unread ? <span className={styles.badge}>{unread}</span> : <MessageSquare size={16} aria-hidden />}
        <span className={styles.vert}>Conversation</span>
        {live ? (
          <span className={styles.stripMeters}>
            <CacheRing usage={usage} compact />
            <b className={styles.stripCtx}>{usage?.context != null ? `${Math.round(usage.context)}%` : "–"}</b>
            <UsagePills usage={usage} compact className={styles.stripPills} />
          </span>
        ) : null}
      </button>
    );
  }

  const working = link.state === "connected" && link.working;
  return (
    <aside
      className={cn(styles.drawer, sheet && styles.sheet)}
      style={{ "--drawer-w": `${width}px` } as React.CSSProperties}
      aria-label="Conversation"
      onDragOver={(e) => {
        if (!live || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDropping(true);
      }}
      onDragLeave={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropping(false);
      }}
      onDrop={(e) => {
        if (!live || !e.dataTransfer.types.includes("Files")) return;
        e.preventDefault();
        setDropping(false);
        addFiles([...e.dataTransfer.files]);
      }}
    >
      <span className={styles.grip} onPointerDown={startDrag} role="separator" aria-orientation="vertical" aria-label="Resize the conversation" />
      <header className={styles.drawerHead}>
        <span className={cn(styles.headDot, working && styles.headDotPulse)} aria-hidden />
        <span className={styles.headTitle}>Conversation</span>
        {onFocusTerminal ? (
          <button type="button" className={styles.iconBtn} onClick={onFocusTerminal} aria-label="Go to the terminal tab" title="Go to the terminal tab">
            <SquareTerminal size={16} aria-hidden />
          </button>
        ) : null}
        <button type="button" className={cn(styles.iconBtn, styles.collapse)} onClick={() => onOpen(false)} aria-label="Collapse the conversation">
          <ChevronRight size={16} aria-hidden />
        </button>
        <button type="button" className={cn(styles.iconBtn, styles.closeSheet)} onClick={() => onSheet(false)} aria-label="Close the conversation">
          <X size={18} aria-hidden />
        </button>
      </header>
      {link.state !== "connected" ? <p className={styles.banner}>{kind.banner(link, slug)}</p> : null}
      <div
        ref={scroller}
        className={styles.msgs}
        onScroll={(e) => {
          const el = e.currentTarget;
          stuck.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
        }}
      >
        {chat.length === 0 && !working ? <p className={styles.dim}>No messages yet.</p> : null}
        {shown.map((e, i) => (
          <Entry key={`${e.kind}-${e.at}-${i}`} slug={slug} e={e} all={chat} open={prompts} link={link} send={send} md={md} kinds={kinds} />
        ))}
        {working ? <LiveGroup turn={liveTurn} /> : null}
      </div>
      {composer?.chip}
      <form
        className={cn(styles.composer, pics.length > 0 && styles.composerWrap)}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        {pics.length ? (
          <div className={styles.tray}>
            {pics.map((p) => (
              <span key={p.id} className={cn(styles.thumb, p.state === "fail" && styles.thumbFail)} style={{ backgroundImage: `url("${p.url}")` }}>
                {p.state === "busy" ? <i className={styles.spin} aria-label="Uploading" /> : p.state === "fail" ? <b>Failed</b> : null}
                <button type="button" className={styles.thumbX} onClick={() => removePic(p)} aria-label="Remove the picture">
                  <X size={10} aria-hidden />
                </button>
              </span>
            ))}
          </div>
        ) : null}
        <textarea
          ref={input}
          value={text}
          rows={2}
          disabled={!live}
          placeholder={
            !live ? "Not connected" : composer ? composer.placeholder : pendingChoice ? "Pick above, or type your own answer…" : "Reply, or Comment to point at the mock…"
          }
          onChange={(e) => setText(e.target.value)}
          onPaste={(e) => {
            const files = [...e.clipboardData.files];
            if (!files.some((f) => f.type.startsWith("image/"))) return;
            e.preventDefault();
            addFiles(files);
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            } else if (e.key === "Escape" && composer) {
              e.preventDefault();
              composer.cancel();
            }
          }}
        />
        <input
          ref={picker}
          type="file"
          hidden
          multiple
          accept={Object.keys(IMAGE_TYPES).join(",")}
          onChange={(e) => {
            addFiles([...(e.target.files ?? [])]);
            e.target.value = "";
          }}
        />
        <button type="button" className={styles.iconBtn} disabled={!live} onClick={() => picker.current?.click()} aria-label="Attach a picture">
          <Paperclip size={16} aria-hidden />
        </button>
        {live ? <CacheRing usage={usage} /> : null}
        <button
          type="submit"
          className={styles.iconBtn}
          disabled={!live || sending || uploading || !canSend}
          title={uploading ? "Waiting for the upload" : undefined}
          aria-label="Send"
        >
          <SendHorizontal size={16} aria-hidden />
        </button>
      </form>
      {live ? <UsagePills usage={usage} className={styles.meters} /> : null}
      {error ? <p className={cn(styles.err, styles.composerErr)}>{error}</p> : null}
      {dropping ? (
        <div className={styles.drop}>
          <ImageIcon size={28} aria-hidden />
          <b>Drop to attach</b>
        </div>
      ) : null}
    </aside>
  );
}
