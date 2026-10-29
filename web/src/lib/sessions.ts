/**
 * Session folders on disk, read-only: `<root>/<slug>/session.json` (extensions/grill/plugin/references/session-format.md). The core
 * reads what every session has; each session kind reads the rest of its own folders through a `SessionFormat`.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

export type SessionBase = {
  slug: string;
  topic: string;
  status: string;
  project?: string;
  started?: string;
  updated?: string;
  /** The session's "next question" line. */
  open?: string;
};

export const isSlug = (s: string): boolean => /^[a-z0-9][a-z0-9-]*$/.test(s);

export const str = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

export function baseFromJson(slug: string, j: Record<string, unknown>): SessionBase {
  return {
    slug,
    topic: str(j.topic) ?? slug,
    status: str(j.status) ?? "in-progress",
    project: str(j.project)?.toUpperCase(),
    started: str(j.started),
    updated: str(j.updated) ?? str(j.started),
    open: str(j.open),
  };
}

/**
 * How a kind reads its session folders: its session.json; a bare `bridge.json`, which a session attached before its
 * first save leaves; and, failing both, another file of the folder (a legacy grill's `<slug>.md`). Null: not one of
 * its sessions.
 */
export type SessionFormat<S extends SessionBase> = {
  json: (slug: string, j: Record<string, unknown>) => S | null;
  bare: (slug: string) => S | null;
  fallback?: { file: (slug: string) => string; read: (slug: string, file: string) => S | null };
};

const BASE: SessionFormat<SessionBase> = {
  json: baseFromJson,
  bare: (slug) => ({ slug, topic: slug, status: "in-progress" }),
};

/** Parsed sessions keyed by file path, reused while the file's mtime is unchanged. */
export type SessionMemo = Map<string, { mtimeMs: number; session: unknown }>;

function memoized<S>(memo: SessionMemo | undefined, path: string, read: () => S): S {
  if (!memo) return read();
  const { mtimeMs } = statSync(path);
  const hit = memo.get(path);
  if (hit?.mtimeMs === mtimeMs) return hit.session as S;
  const session = read();
  memo.set(path, { mtimeMs, session });
  return session;
}

/** One session folder of `root`, read with `format`; null when it holds none of its files or they don't parse. */
export function readSession<S extends SessionBase = SessionBase>(
  root: string,
  slug: string,
  memo?: SessionMemo,
  format: SessionFormat<S> = BASE as SessionFormat<S>,
): S | null {
  const dir = join(root, slug);
  const json = join(dir, "session.json");
  try {
    if (existsSync(json)) return memoized(memo, json, () => format.json(slug, JSON.parse(readFileSync(json, "utf8"))));
    if (existsSync(join(dir, "bridge.json"))) return format.bare(slug);
    const other = format.fallback && join(dir, format.fallback.file(slug));
    if (other && existsSync(other)) return memoized(memo, other, () => format.fallback!.read(slug, other));
  } catch {
    // a half-written or malformed file: skip the session until it parses
  }
  return null;
}

export function slugsIn(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && isSlug(e.name))
    .map((e) => e.name);
}

/** Most recently updated first; ties by slug. */
export function byUpdated(a: SessionBase, b: SessionBase): number {
  return (b.updated ?? "").localeCompare(a.updated ?? "") || a.slug.localeCompare(b.slug);
}
