/**
 * Comment mode inside a mock frame. The frames are same-origin srcdoc documents, so the page reaches
 * into them directly rather than injecting a script that posts messages back.
 */

export const PIN_ATTR = "data-belay-pin";
export const HOVER_ATTR = "data-belay-hover";
export const COMMENT_ATTR = "data-belay-comment";

const cssId = (s: string) => (/^[A-Za-z][\w-]*$/.test(s) ? `#${s}` : `[id="${s.replace(/"/g, '\\"')}"]`);

/**
 * A selector for `el` that reads well in a message and finds it again: it stops at the nearest unique id or
 * `data-id` (the skill marks each question's region with one), else walks up to <body> with tag, classes and
 * `:nth-of-type` where siblings share the tag.
 */
export function cssPath(el: Element): string {
  const doc = el.ownerDocument;
  const parts: string[] = [];
  for (let n: Element | null = el; n && n !== doc.body && n !== doc.documentElement; n = n.parentElement) {
    if (n.id && doc.querySelectorAll(cssId(n.id)).length === 1) {
      parts.unshift(cssId(n.id));
      break;
    }
    const dataId = n.getAttribute("data-id");
    if (dataId && !dataId.includes('"')) {
      const sel = `[data-id="${dataId}"]`;
      if (doc.querySelectorAll(sel).length === 1) {
        parts.unshift(sel);
        break;
      }
    }
    let part = n.tagName.toLowerCase();
    const classes = [...n.classList].filter((c) => /^[A-Za-z_][\w-]*$/.test(c)).slice(0, 2);
    if (classes.length) part += `.${classes.join(".")}`;
    const parent: Element | null = n.parentElement;
    if (parent) {
      const same = [...parent.children].filter((c) => c.tagName === n!.tagName);
      if (same.length > 1) part += `:nth-of-type(${same.indexOf(n) + 1})`;
    }
    parts.unshift(part);
  }
  return parts.join(" > ").slice(0, 1000) || "body";
}

/** The element's visible text, collapsed and cut to a line or two. */
export function elementText(el: Element): string {
  const t = ((el as HTMLElement).innerText ?? el.textContent ?? "").replace(/\s+/g, " ").trim();
  return t.length > 160 ? `${t.slice(0, 157)}…` : t;
}

/** Marks the pinned element (if it's still in this document), clearing any earlier mark. */
export function markPin(doc: Document, selector: string | null) {
  for (const n of doc.querySelectorAll(`[${PIN_ATTR}]`)) n.removeAttribute(PIN_ATTR);
  if (!selector) return;
  try {
    doc.querySelector(selector)?.setAttribute(PIN_ATTR, "");
  } catch {}
}
