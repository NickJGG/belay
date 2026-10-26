"use client";

import * as React from "react";
import { fitDesktop, PHONE } from "@/lib/mock";
import { COMMENT_ATTR, cssPath, elementText, HOVER_ATTR, markPin } from "./pin";
import styles from "./session.module.css";

type Scroll = [number[], number, number][];

const domPath = (n: Element, root: Element) => {
  const p: number[] = [];
  while (n !== root && n.parentElement) {
    p.unshift([...n.parentElement.children].indexOf(n));
    n = n.parentElement;
  }
  return p;
};
const fromPath = (p: number[], root: Element) => p.reduce<Element | undefined>((n, i) => n?.children[i], root);

/** Every scrolled element in the frame, by child-index path, so a re-render can put them back. */
function frameScroll(f: HTMLIFrameElement): Scroll {
  try {
    const cd = f.contentDocument!;
    const root = cd.documentElement;
    return [...cd.querySelectorAll("*")]
      .filter((n) => n.scrollTop || n.scrollLeft)
      .map((n) => [domPath(n, root), n.scrollTop, n.scrollLeft]);
  } catch {
    return [];
  }
}

type Live = React.RefObject<{
  comment: boolean;
  pin: string | null;
  onPin?: (p: { selector: string; text: string }) => void;
}>;

/** Hooks a freshly loaded frame document up to comment mode and the page's shortcuts. */
function wire(cd: Document, live: Live) {
  cd.documentElement.toggleAttribute(COMMENT_ATTR, live.current.comment);
  markPin(cd, live.current.pin);
  let hovered: Element | null = null;
  const unhover = () => {
    hovered?.removeAttribute(HOVER_ATTR);
    hovered = null;
  };
  cd.addEventListener("mouseover", (e) => {
    if (!live.current.comment || !(e.target instanceof cd.defaultView!.Element)) return unhover();
    if (e.target === hovered) return;
    unhover();
    hovered = e.target;
    hovered.setAttribute(HOVER_ATTR, "");
  });
  cd.addEventListener("mouseleave", unhover);
  // Capture phase, so a click on a mock's link or button pins it rather than acting.
  cd.addEventListener(
    "click",
    (e) => {
      const t = e.target;
      if (!live.current.comment || !(t instanceof cd.defaultView!.Element)) return;
      e.preventDefault();
      e.stopPropagation();
      unhover();
      live.current.onPin?.({ selector: cssPath(t), text: elementText(t) });
    },
    true,
  );
  // Key presses don't leave a frame, so the page's shortcuts get a copy, unless the mock itself takes typing.
  cd.addEventListener("keydown", (e) => {
    const t = e.target as HTMLElement | null;
    if (t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)) return;
    const copy = new KeyboardEvent("keydown", { key: e.key, code: e.code, shiftKey: e.shiftKey, ctrlKey: e.ctrlKey, metaKey: e.metaKey, altKey: e.altKey, cancelable: true });
    if (!document.dispatchEvent(copy)) e.preventDefault();
  });
}

/**
 * One mock frame (preview-shell.v1.js's mechanics). Desktop: max(floor, column) wide, scaled down to the
 * column below the floor. `shell` height fills the stage and scrolls inside; `page` is the content's own
 * height, measured from a short frame so it can shrink as well as grow, and the stage scrolls. Phone: 390×844.
 * The srcdoc is set imperatively so the frame's inner scroll survives a re-render.
 */
export function Frame({
  html,
  phone,
  screen,
  floor,
  label,
  labelText,
  comment = false,
  pin = null,
  onPin,
}: {
  html: string;
  phone: boolean;
  screen: "shell" | "page";
  floor: number;
  label: React.ReactNode;
  /** The label as plain text, for its hover title and the frame's title. */
  labelText: string;
  /** Comment mode: hovering outlines an element and a click pins it (`onPin`) instead of reaching the mock. */
  comment?: boolean;
  /** Selector of the pinned element to mark in this frame. */
  pin?: string | null;
  onPin?: (p: { selector: string; text: string }) => void;
}) {
  const fitRef = React.useRef<HTMLDivElement>(null);
  const frameRef = React.useRef<HTMLIFrameElement>(null);
  const live = React.useRef({ comment, pin, onPin });
  React.useLayoutEffect(() => {
    live.current = { comment, pin, onPin };
  });
  const [box, setBox] = React.useState({ w: 0, h: 0 });
  const [contentH, setContentH] = React.useState<number | null>(null);
  const width = React.useRef(0);

  React.useLayoutEffect(() => {
    const el = fitRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setBox({ w: e.contentRect.width, h: e.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const fit = fitDesktop(box.w, floor);
  React.useLayoutEffect(() => {
    width.current = fit.width;
  });

  const measure = React.useCallback(() => {
    const f = frameRef.current;
    if (!f || phone || screen !== "page") return;
    try {
      const prev = f.style.height;
      f.style.width = `${width.current}px`;
      f.style.height = "150px";
      const h = f.contentDocument?.documentElement.scrollHeight ?? 0;
      f.style.height = prev;
      if (h) setContentH(h);
    } catch {}
  }, [phone, screen]);

  React.useEffect(() => {
    const f = frameRef.current;
    if (!f) return;
    const keep = frameScroll(f);
    const onLoad = () => {
      try {
        const de = f.contentDocument!.documentElement;
        for (const [p, t, l] of keep) {
          const n = fromPath(p, de);
          if (n) {
            n.scrollTop = t;
            n.scrollLeft = l;
          }
        }
        wire(f.contentDocument!, live);
        measure();
        void f.contentDocument!.fonts.ready.then(measure);
      } catch {}
    };
    f.addEventListener("load", onLoad, { once: true });
    f.srcdoc = html;
    return () => f.removeEventListener("load", onLoad);
  }, [html, measure]);

  React.useEffect(() => {
    const cd = frameRef.current?.contentDocument;
    if (!cd?.documentElement) return;
    cd.documentElement.toggleAttribute(COMMENT_ATTR, comment);
    if (!comment) for (const n of cd.querySelectorAll(`[${HOVER_ATTR}]`)) n.removeAttribute(HOVER_ATTR);
    markPin(cd, pin);
  }, [comment, pin]);

  // Text reflows with the frame's width, so a page-height frame is re-measured when that changes.
  React.useEffect(measure, [fit.width, measure]);

  let frameStyle: React.CSSProperties;
  let sizer: React.CSSProperties;
  if (phone) {
    frameStyle = { width: PHONE.width, height: PHONE.height };
    sizer = { width: PHONE.width, height: PHONE.height };
  } else {
    const fill = fit.scale ? box.h / fit.scale : 0;
    const h = screen === "shell" ? fill : Math.max(contentH ?? fill, 0);
    frameStyle = {
      width: fit.width,
      height: h,
      transform: fit.scale < 1 ? `scale(${fit.scale})` : undefined,
      transformOrigin: "0 0",
    };
    sizer = { width: box.w, height: h * fit.scale };
  }

  return (
    <div className={styles.frame}>
      <div className={styles.frameLabel} title={labelText}>
        {label}
      </div>
      <div ref={fitRef} className={phone ? styles.fitPhone : styles.fit}>
        <div className={styles.sizer} style={sizer}>
          <iframe ref={frameRef} className={styles.mock} style={frameStyle} title={labelText || "Mock"} />
        </div>
      </div>
    </div>
  );
}
