/**
 * Mock rendering for the session page, ported from grill's preview-shell.v1.js: loading a session's
 * preview.spec.js, building a frame's srcdoc, and the desktop frame's fit. Runs in the browser; pure, so
 * `pnpm test:site` covers it.
 */
import type { Controls, Patch } from "./session-doc.ts";

/** The mock files a frame or the stage may load from a session folder. */
export const MOCK_FILES = ["preview.spec.js", "preview.data.js", "preview.app.css", "preview.mock.css"] as const;
export type MockFile = (typeof MOCK_FILES)[number];

export type Spec = {
  CONTROLS: Controls;
  BASE: Patch;
  renderScreen: (d: Patch, ctx: Record<string, unknown>) => string;
  route: ((d: Patch, ctx: Record<string, unknown>) => string) | null;
};

/**
 * Evaluates preview.data.js (optional) then preview.spec.js as one classic script, as the old shell's
 * `<script>` tags did, and picks out its top-level names. Throws with the script's own error.
 */
export function loadSpec(specText: string, dataText = ""): Spec {
  const pick = (name: string) => `typeof ${name} === "undefined" ? undefined : ${name}`;
  const body = `${dataText}\n;\n${specText}\n;\nreturn { CONTROLS: ${pick("CONTROLS")}, BASE: ${pick("BASE")}, renderScreen: ${pick("renderScreen")}, route: ${pick("route")} };`;
  const got = new Function(body)() as Partial<Spec>;
  if (typeof got.renderScreen !== "function") throw new Error("preview.spec.js defines no renderScreen");
  return {
    CONTROLS: got.CONTROLS && typeof got.CONTROLS === "object" ? got.CONTROLS : {},
    BASE: got.BASE && typeof got.BASE === "object" ? got.BASE : {},
    renderScreen: got.renderScreen,
    route: typeof got.route === "function" ? got.route : null,
  };
}

/** A view's frame body, or a visible error in its place so one broken option doesn't blank the stage. */
export function renderBody(spec: Spec, d: Patch, ctx: Record<string, unknown>): string {
  try {
    return String(spec.renderScreen(d, ctx));
  } catch (err) {
    return `<pre style="padding:16px;color:#d23c3c;white-space:pre-wrap">renderScreen threw: ${esc((err as Error)?.message ?? String(err))}</pre>`;
  }
}

export function routeLabel(spec: Spec, d: Patch, ctx: Record<string, unknown>): string {
  if (!spec.route) return "";
  try {
    return String(spec.route(d, ctx));
  } catch {
    return "";
  }
}

const esc = (t: string) => t.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const attr = (t: string) => esc(t).replace(/"/g, "&quot;");

/* Injected before the app's CSS so the app can override it. .pv-undecided is drawn inside mocks, so the stage provides it. */
export const FRAME_CSS = `html, body { margin: 0; } html { background: var(--paper, Canvas); color-scheme: light; } :root[data-theme="dark"] { color-scheme: dark; }
.pv-undecided { display: grid; place-items: center; min-height: 80px; border: 2px dashed var(--faint, #9a948a); border-radius: 10px; background: var(--wash, #f2f0ea); color: var(--muted, #6b665c); font: 600 13px system-ui, -apple-system, "Segoe UI", sans-serif; }
html[data-belay-comment], html[data-belay-comment] * { cursor: crosshair !important; }
[data-belay-hover] { outline: 2px dashed oklch(0.72 0.17 45) !important; outline-offset: 2px; }
[data-belay-pin] { outline: 2px solid oklch(0.72 0.17 45) !important; outline-offset: 2px; box-shadow: 0 0 0 6px color-mix(in srgb, oklch(0.72 0.17 45) 25%, transparent) !important; }`;

/** A frame's full document: theme on <html>, the fonts, app and mock CSS (in that order), then the body. */
export function frameDoc({ body, theme, styles }: { body: string; theme: "light" | "dark"; styles: string[] }): string {
  const links = styles.map((href) => `<link rel="stylesheet" href="${attr(href)}">`).join("");
  return `<!doctype html><html lang="en" data-theme="${theme}"${theme === "dark" ? ' class="dark"' : ""}><head><meta charset="utf-8"><style>${FRAME_CSS}</style>${links}</head><body>${body}</body></html>`;
}

export const PHONE = { width: 390, height: 844 };

/** Desktop: the frame is max(floor, column) wide and scaled down to the column below the floor, never up. */
export function fitDesktop(column: number, floor: number): { width: number; scale: number } {
  const width = Math.max(floor, column);
  return { width, scale: width > 0 ? Math.min(1, column / width) : 1 };
}
