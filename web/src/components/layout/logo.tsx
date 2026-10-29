import * as React from "react";
import { cn } from "@/lib/utils";
import styles from "./logo.module.css";

/** A contour ring run on, as one stroke, into an open carabiner gate. */
export const MARK_PATH =
  "M8.2 33C8.44 29.69 8 26.15 8.93 23.07C9.83 20.05 11.43 16.83 13.63 14.68C15.83 12.52 19.11 10.89 22.13 10.13C25.12 9.36 28.57 9.57 31.63 10.05C34.61 10.52 37.55 11.63 40.25 12.9C42.91 14.15 45.52 15.67 47.73 17.57C49.94 19.49 52.11 21.78 53.5 24.35C54.9 26.95 55.88 30.12 56.05 33.1C56.22 36.11 55.6 39.47 54.48 42.33C53.34 45.2 51.43 48.06 49.25 50.27C47.07 52.49 44.24 54.48 41.38 55.63C38.54 56.76 35.09 57.34 32.15 57.17C29.38 57.02 26.3 56.25 24.18 54.88C22.24 53.63 20.66 51.69 19.71 49.6C18.68 47.34 18.59 44.43 18.5 41.65C18.39 38.59 19.03 35.22 19.3 32";

export type MarkTone = "brand" | "current";

/** What a nav or section icon is drawn with: lucide's props, which a mark takes too. */
export type IconProps = { size?: number; "aria-hidden"?: boolean; className?: string };

/** A mark's props: Dusk gradient or currentColor, sized by `size` or className. */
export type MarkProps = IconProps & { tone?: MarkTone };

/** 7.5 of 60 is ~2px at 16px, heavier than lucide's 1.33px, so a mark drawn at icon `size` thins to this. */
const ICON_STROKE = 5.5;

/**
 * A mark in the Belay mark's grammar: one 7.5-wide round-capped stroke and a solid dot, in the Dusk gradient (or
 * currentColor). `box` is the square viewBox's corner and side; the gradient runs across it bottom-left to top-right.
 * Given a `size`, it's an icon: that many px square, with a thinner stroke.
 */
export function StrokeMark({
  path,
  dot,
  box = [2, 2, 60],
  tone = "brand",
  size,
  className,
}: MarkProps & { path: string; dot: { x: number; y: number; r: number }; box?: [number, number, number] }) {
  const id = React.useId();
  const [x, y, side] = box;
  const paint = tone === "brand" ? `url(#${id})` : "currentColor";
  return (
    <svg viewBox={`${x} ${y} ${side} ${side}`} width={size} height={size} className={className} aria-hidden>
      {tone === "brand" ? (
        <defs>
          <linearGradient id={id} gradientUnits="userSpaceOnUse" x1={x} y1={y + side} x2={x + side} y2={y}>
            {/* var() only resolves in CSS, not in the stop-color attribute */}
            <stop offset="0" style={{ stopColor: "var(--brand)" }} />
            <stop offset="1" style={{ stopColor: "var(--brand-2)" }} />
          </linearGradient>
        </defs>
      ) : null}
      <path d={path} fill="none" stroke={paint} strokeWidth={size ? ICON_STROKE : 7.5} strokeLinecap="round" strokeLinejoin="round" />
      <circle cx={dot.x} cy={dot.y} r={dot.r} fill={paint} />
    </svg>
  );
}

/** The Belay mark: the carabiner ring and its summit dot. */
export function Mark(props: MarkProps) {
  return <StrokeMark path={MARK_PATH} dot={{ x: 35.5, y: 29, r: 7.5 }} box={[4, 5.5, 57]} {...props} />;
}

/** The mark and lowercase "belay". Sized by font-size. */
export function Wordmark({ className }: { className?: string }) {
  return (
    <span className={cn(styles.wordmark, className)}>
      <Mark className={styles.mark} />
      belay
    </span>
  );
}
