import assert from "node:assert/strict";
import { test } from "node:test";
import { parseStatusLine, UsageStore, type StatusLine } from "../usage.ts";

const line = (p: unknown) => {
  const r = parseStatusLine(p);
  assert.ok(r, `rejected ${JSON.stringify(p)}`);
  return r as StatusLine;
};

test("parseStatusLine keeps the meters' fields and drops the rest", () => {
  const p = line({
    session_id: "a",
    model: { display_name: "Opus" },
    context_window: { used_percentage: 42, total_input_tokens: 1 },
    rate_limits: { five_hour: { used_percentage: 10, resets_at: 1000 }, other: { used_percentage: 3 } },
    prompt_cache: { warm: true, ttl: "5m", expires_at: 900, recache_tokens_if_cold: 12000 },
  });
  assert.deepEqual(p, {
    session_id: "a",
    context_window: { used_percentage: 42 },
    rate_limits: { five_hour: { used_percentage: 10, resets_at: 1000 } },
    prompt_cache: { warm: true, ttl: "5m", expires_at: 900, recache_tokens_if_cold: 12000 },
  });
});

test("parseStatusLine rejects a bad ttl and out-of-range values", () => {
  for (const bad of [
    { prompt_cache: { ttl: "5 minutes" } },
    { prompt_cache: { ttl: "12345m" } },
    { prompt_cache: { recache_tokens_if_cold: 1.5 } },
    { prompt_cache: { recache_tokens_if_cold: -1 } },
    { context_window: { used_percentage: -1 } },
    { context_window: { used_percentage: 1001 } },
    { rate_limits: { seven_day: { used_percentage: 5, resets_at: 1e12 } } },
    { session_id: "x".repeat(129) },
    "nope",
    null,
  ]) {
    assert.equal(parseStatusLine(bad), null, JSON.stringify(bad));
  }
});

test("a fresh store has no snapshot", () => {
  assert.equal(new UsageStore().snapshot("a"), null);
});

test("limits are shared across sessions, context and cache are per session", () => {
  const s = new UsageStore();
  s.record(line({ session_id: "a", context_window: { used_percentage: 30 }, prompt_cache: { warm: true, ttl: "5m", expires_at: 500 } }), 100);
  s.record(line({ session_id: "b", context_window: { used_percentage: 70 }, rate_limits: { five_hour: { used_percentage: 20, resets_at: 9000 } } }), 110);
  assert.deepEqual(s.snapshot("a"), {
    at: 110,
    context: 30,
    fiveHour: { pct: 20, resetsAt: 9000 },
    sevenDay: null,
    cache: { warm: true, ttl: "5m", expiresAt: 500, recacheTokens: null },
  });
  assert.deepEqual(s.snapshot("b"), { at: 110, context: 70, fiveHour: { pct: 20, resetsAt: 9000 }, sevenDay: null, cache: null });
  assert.deepEqual(s.snapshot("unknown"), { at: 110, context: null, fiveHour: { pct: 20, resetsAt: 9000 }, sevenDay: null, cache: null });
  // A payload without rate_limits leaves them be.
  s.record(line({ session_id: "a", context_window: { used_percentage: 31 } }), 120);
  assert.deepEqual(s.snapshot("b")?.fiveHour, { pct: 20, resetsAt: 9000 });
});

test("sessions are an LRU of 16", () => {
  const s = new UsageStore();
  for (let i = 0; i < 16; i++) s.record(line({ session_id: `s${i}`, context_window: { used_percentage: i } }), 100 + i);
  s.record(line({ session_id: "s0", context_window: { used_percentage: 50 } }), 200);
  s.record(line({ session_id: "s16", context_window: { used_percentage: 16 } }), 201);
  assert.equal(s.snapshot("s0")?.context, 50);
  assert.equal(s.snapshot("s1")?.context, null);
  assert.equal(s.snapshot("s16")?.context, 16);
});

test("due sends a change at once and an unchanged snapshot at most once a minute, per target", () => {
  const s = new UsageStore();
  const at = (t: number, ctx = 10) => {
    s.record(line({ session_id: "a", context_window: { used_percentage: ctx } }), t);
    return s.snapshot("a")!;
  };
  assert.equal(s.due("x", at(1000)), true);
  assert.equal(s.due("x", at(1030)), false);
  assert.equal(s.due("y", at(1031)), true);
  assert.equal(s.due("x", at(1040, 11)), true);
  assert.equal(s.due("x", at(1099, 11)), false);
  assert.equal(s.due("x", at(1100, 11)), true);
});
