/** What the Sear site may send the bridge, and how each message reads as a channel notification. */
import { randomBytes, timingSafeEqual } from "node:crypto";
import path from "node:path";
import { z } from "zod";
export const SLUG = /^[a-z0-9][a-z0-9-]{0,63}$/;
export const MAX_BODY = 64 * 1024;
export const SITE_PORT = Number(process.env.SEAR_SITE_PORT ?? 4747);
/** Mirrors `src/lib/images.ts` (a test checks they agree). */
export const IMAGE_NAME = /^\d{8}T\d{6}-[0-9a-f]{6}\.(png|jpg|gif|webp)$/;
export const MAX_IMAGES = 6;
const Slug = z.string().regex(SLUG);
const Q = z.number().int().min(1).max(999);
const Opt = z.string().regex(/^[A-Za-z0-9-]{1,16}$/);
const Note = z.string().trim().min(1).max(4000);
const Images = z.array(z.string().regex(IMAGE_NAME)).max(MAX_IMAGES).optional();
export const Message = z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("chat"), slug: Slug, text: z.string().trim().max(8000), images: Images }),
    z.object({ kind: z.literal("answer"), slug: Slug, q: Q, opt: Opt, note: Note.optional() }),
    z.object({
        kind: z.literal("comment"),
        slug: Slug,
        q: Q,
        opt: Opt,
        selector: z.string().min(1).max(1000),
        text: z.string().max(2000),
        note: Note,
        images: Images,
    }),
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
    // Lessons only: work handed in from the Work tab, and a start button asking for a fresh session.
    z.object({
        kind: z.literal("attempt"),
        slug: Slug,
        path: z.string().regex(/^work\/[^\0]{1,500}$/).refine((p) => !p.split("/").includes("..")),
        text: Note.optional(),
    }),
    z.object({ kind: z.literal("restart"), slug: Slug, label: z.string().trim().min(1).max(128), wrap: z.boolean().optional() }),
]);
export function parseMessage(body) {
    try {
        const parsed = Message.safeParse(JSON.parse(body));
        if (!parsed.success)
            return null;
        const m = parsed.data;
        if (m.kind === "chat" && !m.text && !m.images?.length)
            return null;
        if (m.kind === "choice" && (m.option === undefined) === (m.text === undefined))
            return null;
        if (m.kind === "choice" && m.option !== undefined && m.images?.length)
            return null;
        return m;
    }
    catch {
        return null;
    }
}
/** The pictures a message carries; only chat, comment and choice take any. */
export const imagesOf = (m) => ("images" in m ? (m.images ?? []) : []);
const pictures = (n) => `${n} ${n === 1 ? "picture" : "pictures"}`;
/**
 * The notification for a forwarded message; every one names the site and the session. A push is text only, so
 * attached pictures (files in `imagesDir`) are listed as absolute paths for Claude to Read.
 */
export function toChannel(m, imagesDir = ".", lesson) {
    const c = channelOf(m, lesson);
    const images = imagesOf(m);
    if (!images.length)
        return c;
    c.meta.images = String(images.length);
    const list = images.map((n) => `- ${path.resolve(imagesDir, n)}`).join("\n");
    return { ...c, content: `${c.content}\n\nAttached pictures (Read each before answering):\n${list}` };
}
function channelOf(m, lesson) {
    const head = lesson ? `Belay site, lesson \`${m.slug}\` on ${lesson.course}` : `Sear site, session \`${m.slug}\``;
    const meta = { slug: m.slug, kind: m.kind, ...(lesson ? { course: lesson.course } : {}) };
    switch (m.kind) {
        case "attempt":
            meta.path = m.path;
            return { content: `${head}: submitted \`${m.path}\` for you to read.${m.text ? `\n\n${m.text}` : ""}`, meta };
        case "restart":
            meta.wrap = String(!!m.wrap);
            return { content: `${head}: restart for ${m.label}.`, meta };
        case "chat":
            return { content: m.text ? `${head}:\n\n${m.text}` : `${head}: sent ${pictures(m.images?.length ?? 0)}.`, meta };
        case "answer":
            Object.assign(meta, { q: String(m.q), opt: m.opt });
            return {
                content: `${head}: picked option ${m.opt} for Q${m.q}.${m.note ? `\n\nNote with the pick:\n\n${m.note}` : ""}`,
                meta,
            };
        case "comment": {
            Object.assign(meta, { q: String(m.q), opt: m.opt, selector: m.selector });
            const text = m.text.trim() ? ` ("${m.text.trim().replace(/\s+/g, " ")}")` : "";
            return {
                content: `${head}: comment on Q${m.q} option ${m.opt}, element \`${m.selector}\`${text}:\n\n${m.note}`,
                meta,
            };
        }
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
    const open = new Map();
    return {
        open(options) {
            let id;
            do
                id = randomBytes(3).toString("hex");
            while (open.has(id));
            open.set(id, options);
            return id;
        },
        resolve(m) {
            const options = open.get(m.id);
            if (!options)
                return `no open choice ${m.id}`;
            if (m.option !== undefined && !options.includes(m.option))
                return `"${m.option}" is not an option of ${m.id}`;
            open.delete(m.id);
            return null;
        },
        clear: () => open.clear(),
    };
}
export function tokenMatches(got, token) {
    const a = Buffer.from(typeof got === "string" ? got : "");
    const b = Buffer.from(token);
    return a.length === b.length && timingSafeEqual(a, b);
}
export const siteOrigins = (port = SITE_PORT) => [`http://127.0.0.1:${port}`, `http://localhost:${port}`];
/** No Origin means a non-browser caller (the site's server, curl); the token still guards it. */
export function originAllowed(origin, allowed) {
    return origin === undefined || allowed.includes(origin);
}
/** Refuses DNS-rebound requests: a browser sends the attacker's hostname in Host. */
export function hostAllowed(host, port) {
    return host === `127.0.0.1:${port}` || host === `localhost:${port}`;
}
