"use client";

import * as React from "react";
import type { Limit, Usage } from "@/lib/usage";
import { cn } from "@/lib/utils";
import styles from "./session.module.css";

/*
 * The status line's numbers in the drawer (topo's chat panel meters): context and plan-limit pills, shown exactly
 * as the last payload had them, and a prompt cache ring that drains client-side towards `expiresAt`.
 */

/** statusline.sh's `format_remaining`: `3d4h`, `2h10m`, `45m`. */
function remaining(secs: number) {
  if (secs < 60) return "<1m";
  const d = Math.floor(secs / 86400);
  const h = Math.floor((secs % 86400) / 3600);
  const m = Math.floor((secs % 3600) / 60);
  if (d) return h ? `${d}d${h}h` : `${d}d`;
  if (h) return m ? `${h}h${m}m` : `${h}h`;
  return `${m}m`;
}

function tokens(n: number) {
  if (n >= 1e6) return `${(n / 1e6).toFixed(1).replace(/\.0$/, "")}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}

const UNIT = { s: 1, m: 60, h: 3600 } as const;

function ttlSeconds(ttl: string | null | undefined) {
  const m = /^(\d+)([smh])$/.exec(ttl ?? "");
  return m ? Number(m[1]) * UNIT[m[2] as keyof typeof UNIT] : null;
}

/**
 * Time until `limit` hits 100% at the window's average pace so far, even past the reset.
 * None at 0% (no pace yet) or 100%.
 * Linear extrapolation, so a burst early in the window overstates the burn.
 */
function forecast(limit: Limit, windowSecs: number, at: number) {
  if (!limit || limit.resetsAt == null) return undefined;
  const left = limit.resetsAt - at;
  const elapsed = windowSecs - left;
  if (left <= 0 || elapsed <= 0 || limit.pct <= 0 || limit.pct >= 100) return undefined;
  return `~${remaining(((100 - limit.pct) * elapsed) / limit.pct)}`;
}

function Pill({ label, pct, reset, tip }: { label: string; pct: number | null; reset?: string; tip?: string }) {
  if (pct == null) {
    return (
      <span className={cn(styles.pill, styles.pillDash)}>
        {label} <b>–</b>
      </span>
    );
  }
  const tone = pct <= 50 ? null : pct <= 75 ? styles.pillWarn : styles.pillBad;
  return (
    <span
      className={cn(styles.pill, tone, tip && styles.tipped)}
      style={{ "--pct": `${Math.min(pct, 100)}%` } as React.CSSProperties}
      tabIndex={tip ? 0 : undefined}
    >
      {label} <b>{Math.round(pct)}%</b>
      {reset ? <small>{reset}</small> : null}
      {tip ? <span className={styles.tip}>{tip}</span> : null}
    </span>
  );
}

const FIVE_HOURS = 5 * 3600;
const SEVEN_DAYS = 7 * 86400;

/** Context, 5h and 7d; `compact` (the phone strip, itself a button) shortens the label and drops reset times and tips. */
export function UsagePills({ usage, compact = false, className }: { usage: Usage | null; compact?: boolean; className?: string }) {
  const reset = (l: Limit) =>
    !compact && usage && l?.resetsAt != null && l.resetsAt > usage.at ? remaining(l.resetsAt - usage.at) : undefined;
  const tip = (l: Limit, windowSecs: number) => (!compact && usage ? forecast(l, windowSecs, usage.at) : undefined);
  return (
    <span className={cn(styles.pills, compact && styles.pillsCompact, className)} aria-label="Claude usage">
      <Pill label={compact ? "ctx" : "Context"} pct={usage?.context ?? null} />
      <Pill
        label="5h"
        pct={usage?.fiveHour?.pct ?? null}
        reset={reset(usage?.fiveHour ?? null)}
        tip={tip(usage?.fiveHour ?? null, FIVE_HOURS)}
      />
      <Pill
        label="7d"
        pct={usage?.sevenDay?.pct ?? null}
        reset={reset(usage?.sevenDay ?? null)}
        tip={tip(usage?.sevenDay ?? null, SEVEN_DAYS)}
      />
    </span>
  );
}

/** Prompt cache time left as a draining ring; once cold, the tokens the next message re-caches. `compact` drops the tip. */
export function CacheRing({ usage, compact = false }: { usage: Usage | null; compact?: boolean }) {
  const cache = usage?.cache;
  const [now, setNow] = React.useState(() => Date.now() / 1000);

  React.useEffect(() => {
    const timer = setInterval(() => setNow(Date.now() / 1000), 10_000);
    return () => clearInterval(timer);
  }, []);

  if (!cache) {
    return (
      <span className={styles.cache}>
        <Ring className={styles.ringCold} label="Prompt cache: no data yet" />
      </span>
    );
  }

  const left = cache.expiresAt != null ? cache.expiresAt - now : 0;
  if (!cache.warm || left <= 0) {
    const cost = cache.recacheTokens != null ? tokens(cache.recacheTokens) : null;
    return (
      <span className={styles.cache}>
        <Ring
          className={styles.ringCold}
          label={cost ? `Prompt cache cold · next message re-caches ${cost} tokens` : "Prompt cache cold"}
          tip={compact ? undefined : (cost ?? undefined)}
        />
      </span>
    );
  }

  const ttl = ttlSeconds(cache.ttl);
  const frac = ttl ? Math.min(left / ttl, 1) : 1;
  const tone = frac > 0.25 ? null : frac > 0.1 ? styles.ringWarn : styles.ringBad;
  const time = remaining(left);
  return (
    <span className={styles.cache}>
      <Ring className={tone} pct={frac * 100} label={`Prompt cache warm · ${time} left`} tip={compact ? undefined : time} />
    </span>
  );
}

/** With `tip`, focusable so keyboard users see it too. */
function Ring({ className, pct, label, tip }: { className?: string | null; pct?: number; label: string; tip?: string }) {
  return (
    <span className={cn(styles.ringWrap, styles.tipped)} tabIndex={tip ? 0 : undefined} role="img" aria-label={label}>
      <span
        className={cn(styles.ring, className)}
        style={pct == null ? undefined : ({ "--pct": `${pct}%` } as React.CSSProperties)}
      />
      {tip ? (
        <span className={styles.tip} aria-hidden>
          {tip}
        </span>
      ) : null}
    </span>
  );
}
