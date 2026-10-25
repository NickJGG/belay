import * as React from "react";
import { cn } from "@/lib/utils";
import styles from "./logo.module.css";

/** Topo's contour ring run on, as one stroke, into an open carabiner gate (grill merge-belay-sear-topo, l32). */
export const MARK_PATH =
  "M8.2 33C8.44 29.69 8 26.15 8.93 23.07C9.83 20.05 11.43 16.83 13.63 14.68C15.83 12.52 19.11 10.89 22.13 10.13C25.12 9.36 28.57 9.57 31.63 10.05C34.61 10.52 37.55 11.63 40.25 12.9C42.91 14.15 45.52 15.67 47.73 17.57C49.94 19.49 52.11 21.78 53.5 24.35C54.9 26.95 55.88 30.12 56.05 33.1C56.22 36.11 55.6 39.47 54.48 42.33C53.34 45.2 51.43 48.06 49.25 50.27C47.07 52.49 44.24 54.48 41.38 55.63C38.54 56.76 35.09 57.34 32.15 57.17C29.38 57.02 26.3 56.25 24.18 54.88C22.24 53.63 20.66 51.69 19.71 49.6C18.68 47.34 18.59 44.43 18.5 41.65C18.39 38.59 19.03 35.22 19.3 32";

/** The Belay mark: the carabiner ring and its summit dot in the Dusk gradient (or currentColor). Sized by className. */
export function Mark({ tone = "brand", className }: { tone?: "brand" | "current"; className?: string }) {
  const id = React.useId();
  const paint = tone === "brand" ? `url(#${id})` : "currentColor";
  return (
    <svg viewBox="4 5.5 57 57" className={className} aria-hidden>
      {tone === "brand" ? (
        <defs>
          <linearGradient id={id} gradientUnits="userSpaceOnUse" x1="4" y1="62.5" x2="61" y2="5.5">
            {/* var() only resolves in CSS, not in the stop-color attribute */}
            <stop offset="0" style={{ stopColor: "var(--brand)" }} />
            <stop offset="1" style={{ stopColor: "var(--brand-2)" }} />
          </linearGradient>
        </defs>
      ) : null}
      <path d={MARK_PATH} fill="none" stroke={paint} strokeWidth="7.5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="35.5" cy="29" r="7.5" fill={paint} />
    </svg>
  );
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
