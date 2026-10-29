/** What the Belay site may send the bridge, and how each message reads as a channel notification: the core kinds. */
import { randomBytes, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { z } from "zod";

export const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const MAX_BODY = 64 * 1024;
export const SITE_PORT = Number(process.env.BELAY_SITE_PORT ?? 4747);
/** Mirrors `src/lib/images.ts` (a test checks they agree). */
export const IMAGE_NAME = /^\d{8}T\d{6}-[0-9a-f]{6}\.(png|jpg|gif|webp)$/;
export const MAX_IMAGES = 6;

export const Slug = z.string().regex(SLUG);
export const Note = z.string().trim().min(1).max(4000);
export const Images = z.array(z.string().regex(IMAGE_NAME)).max(MAX_IMAGES).optional();

/** A site message kind; each session kind adds its own (kinds/). */
export type MessageSchema = z.ZodObject;

export const CoreMessages = [
  z.object({ kind: z.literal("chat"), slug: Slug, text: z.string().trim().max(8000), images: Images }),
  z.object({
    kind: z.literal("choice"),
    slug: Slug,
    id: z.string().regex(/^[0-9a-f]{6}$/),
    option: z.string().min(1).max(200).optional(),
    text: Note.optional(),
    images: Images,
  }),
  z.object({
    kind: z.literal("permission"),
    slug: Slug,
    request_id: z.string().regex(/^[a-km-z]{5}$/),
    behavior: z.enum(["allow", "deny"]),
  }),
  // Handled by the bridge itself (focus.mts), never forwarded to Claude.
  z.object({ kind: z.literal("focus"), slug: Slug }).strict(),
] as const;
export type CoreMessage = z.infer<(typeof CoreMessages)[number]>;

/** What a site message has at least; each kind's own fields come from its schema. */
export type AnyMessage = { kind: string; slug: string; images?: string[] };

/** A parser for site messages: the core kinds plus `extra`, the session kinds' own. */
export function parseMessage<M extends AnyMessage = CoreMessage>(extra: readonly MessageSchema[] = []): (body: string) => M | null {
  const schema = z.discriminatedUnion("kind", [...CoreMessages, ...extra] as unknown as [MessageSchema, ...MessageSchema[]]);
  return (body) => {
    try {
      const parsed = schema.safeParse(JSON.parse(body));
      if (!parsed.success) return null;
      const m = parsed.data as unknown as CoreMessage;
      if (m.kind === "chat" && !m.text && !m.images?.length) return null;
      if (m.kind === "choice" && (m.option === undefined) === (m.text === undefined)) return null;
      if (m.kind === "choice" && m.option !== undefined && m.images?.length) return null;
      return m as unknown as M;
    } catch {
      return null;
    }
  };
}

export type Channel = { content: string; meta: Record<string, string> };

/** The pictures a message carries; only chat, comment and choice take any. */
export const imagesOf = (m: AnyMessage): string[] => m.images ?? [];

export const pictures = (n: number) => `${n} ${n === 1 ? "picture" : "pictures"}`;

/** How a session names itself in a notification: `head` opens the content, `meta` adds to the tag. */
export type Head = { head: string; meta: Record<string, string> };

/** A message kind's notification, given its session's head and the tag so far (`slug`, `kind`, the session's own). */
export type Format = (m: AnyMessage, head: string, meta: Record<string, string>) => Channel | undefined;

/**
 * The notification for a forwarded message; every one names the site and the session. A push is text only, so
 * attached pictures (files in `imagesDir`) are listed as absolute paths for Claude to Read. `format` covers the
 * session kinds' messages; chat and choice are core.
 */
export function toChannel(m: AnyMessage, imagesDir: string, session: Head, format?: Format): Channel {
  const meta: Record<string, string> = { slug: m.slug, kind: m.kind, ...session.meta };
  const c = coreChannel(m as CoreMessage, session.head, meta) ?? format?.(m, session.head, meta);
  if (!c) throw new Error(`no notification for a ${m.kind} message`);
  const images = imagesOf(m);
  if (!images.length) return c;
  c.meta.images = String(images.length);
  const list = images.map((n) => `- ${path.resolve(imagesDir, n)}`).join("\n");
  return { ...c, content: `${c.content}\n\nAttached pictures (Read each before answering):\n${list}` };
}

function coreChannel(m: CoreMessage, head: string, meta: Record<string, string>): Channel | undefined {
  switch (m.kind) {
    case "chat":
      return { content: m.text ? `${head}:\n\n${m.text}` : `${head}: sent ${pictures(m.images?.length ?? 0)}.`, meta };
    case "choice":
      meta.id = m.id;
      if (m.option !== undefined) {
        meta.option = m.option;
        return { content: `${head}: chose "${m.option}" for choice ${m.id}.`, meta };
      }
      return { content: `${head}: dismissed choice ${m.id} and wrote:\n\n${m.text}`, meta };
  }
}

/** Open `choice` prompts; a site answer must name one, and an option must be one of its buttons. */
export function createChoices() {
  const open = new Map<string, string[]>();
  return {
    open(options: string[]): string {
      let id: string;
      do id = randomBytes(3).toString("hex");
      while (open.has(id));
      open.set(id, options);
      return id;
    },
    resolve(m: Extract<CoreMessage, { kind: "choice" }>): string | null {
      const options = open.get(m.id);
      if (!options) return `no open choice ${m.id}`;
      if (m.option !== undefined && !options.includes(m.option)) return `"${m.option}" is not an option of ${m.id}`;
      open.delete(m.id);
      return null;
    },
    clear: () => open.clear(),
  };
}

export function tokenMatches(got: unknown, token: string): boolean {
  const a = Buffer.from(typeof got === "string" ? got : "");
  const b = Buffer.from(token);
  return a.length === b.length && timingSafeEqual(a, b);
}

export const siteOrigins = (port = SITE_PORT) => [`http://127.0.0.1:${port}`, `http://localhost:${port}`];

/** No Origin means a non-browser caller (the site's server, curl); the token still guards it. */
export function originAllowed(origin: string | undefined, allowed: string[]): boolean {
  return origin === undefined || allowed.includes(origin);
}

/** Refuses DNS-rebound requests: a browser sends the attacker's hostname in Host. */
export function hostAllowed(host: string | undefined, port: number): boolean {
  return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}
