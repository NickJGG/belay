import { z } from "zod";

/*
 * The status line's numbers (statusline.sh POSTs every tick to /api/usage), ported from topo's bridge.
 * Rate limits are account-wide, so any session's payload updates them; context and cache are per session.
 */

const Pct = z.number().min(0).max(1000).nullish();
const Epoch = z.number().min(0).max(1e11).nullish();
const RateLimit = z.object({ used_percentage: Pct, resets_at: Epoch }).nullish();
const StatusLine = z.object({
  session_id: z.string().max(128).nullish(),
  context_window: z.object({ used_percentage: Pct }).nullish(),
  rate_limits: z.object({ five_hour: RateLimit, seven_day: RateLimit }).nullish(),
  prompt_cache: z
    .object({
      warm: z.boolean().nullish(),
      ttl: z.string().regex(/^\d{1,4}[smh]$/).nullish(),
      expires_at: Epoch,
      recache_tokens_if_cold: z.number().int().min(0).max(1e9).nullish(),
    })
    .nullish(),
});

export type StatusLine = z.infer<typeof StatusLine>;
export type Limit = { pct: number; resetsAt: number | null } | null;
export type Cache = { warm: boolean; ttl: string | null; expiresAt: number | null; recacheTokens: number | null };
/** One session's meters; times are epoch seconds. */
export type Usage = { at: number; context: number | null; fiveHour: Limit; sevenDay: Limit; cache: Cache | null };

/** The payload, or null when it doesn't match the status line's shape. */
export function parseStatusLine(raw: unknown): StatusLine | null {
  const r = StatusLine.safeParse(raw);
  return r.success ? r.data : null;
}

const MAX_SESSIONS = 16;
const RESEND_SECS = 60;

const limit = (l: z.infer<typeof RateLimit>): Limit =>
  l?.used_percentage == null ? null : { pct: l.used_percentage, resetsAt: l.resets_at ?? null };

export class UsageStore {
  private limits: { fiveHour: Limit; sevenDay: Limit } = { fiveHour: null, sevenDay: null };
  private sessions = new Map<string, { context: number | null; cache: Cache | null }>();
  private sent = new Map<string, { key: string; at: number }>();
  at = 0;

  record(p: StatusLine, now = Math.floor(Date.now() / 1000)) {
    this.at = now;
    if (p.rate_limits) this.limits = { fiveHour: limit(p.rate_limits.five_hour), sevenDay: limit(p.rate_limits.seven_day) };
    if (!p.session_id) return;
    const c = p.prompt_cache;
    this.sessions.delete(p.session_id);
    this.sessions.set(p.session_id, {
      context: p.context_window?.used_percentage ?? null,
      cache: c
        ? { warm: !!c.warm, ttl: c.ttl ?? null, expiresAt: c.expires_at ?? null, recacheTokens: c.recache_tokens_if_cold ?? null }
        : null,
    });
    if (this.sessions.size > MAX_SESSIONS) this.sessions.delete(this.sessions.keys().next().value!);
  }

  /** Null until the first payload. */
  snapshot(sessionId: string | null): Usage | null {
    if (!this.at) return null;
    const s = sessionId ? this.sessions.get(sessionId) : undefined;
    return { at: this.at, context: s?.context ?? null, ...this.limits, cache: s?.cache ?? null };
  }

  /** Whether `u` should go out to `target`: on change, or unchanged once a minute so reset countdowns move. */
  due(target: string, u: Usage): boolean {
    const key = JSON.stringify({ ...u, at: 0 });
    const last = this.sent.get(target);
    if (last && last.key === key && u.at - last.at < RESEND_SECS) return false;
    this.sent.set(target, { key, at: u.at });
    return true;
  }
}
