import * as React from "react";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import styles from "./toolbar.module.css";

/**
 * Sticky page header bleeding to the content edges: optional back chevron,
 * a 30px title, faint meta, then the page's actions right beside them.
 * `nav` is a full-width row under them; it sizes and hides itself.
 * `backdrop` fills the bar behind everything, clipped to it.
 */
export function Toolbar({
  title,
  back,
  meta,
  nav,
  backdrop,
  children,
}: {
  title: React.ReactNode;
  back?: { href: string; label: string };
  meta?: React.ReactNode;
  nav?: React.ReactNode;
  backdrop?: React.ReactNode;
  children?: React.ReactNode;
}) {
  return (
    <header className={cn(styles.bar, backdrop != null && styles.hasBackdrop)}>
      {backdrop ? <div className={styles.backdrop}>{backdrop}</div> : null}
      {back ? (
        <Link
          href={back.href}
          className={styles.back}
          aria-label={`Back to ${back.label}`}
        >
          <ChevronLeft size={22} aria-hidden />
        </Link>
      ) : null}
      <h1 className={styles.title}>{title}</h1>
      {meta ? <span className={styles.meta}>{meta}</span> : null}
      {children ? <div className={styles.actions}>{children}</div> : null}
      {nav}
    </header>
  );
}

/** The one action size used in every toolbar: a brand-filled pill. */
export const toolbarAction = styles.action;
/** Same size as `toolbarAction`, outlined in ink, for a secondary action. */
export const toolbarActionQuiet = styles.actionQuiet;
