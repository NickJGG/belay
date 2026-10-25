"use client";

import { ChevronRight } from "lucide-react";
import { COLLAPSED_COOKIE, parseToggled } from "@/lib/collapsed";
import { cn } from "@/lib/utils";
import styles from "./belay.module.css";

function writeToggled(id: string, toggled: boolean) {
  const current = document.cookie.match(new RegExp(`(?:^|; )${COLLAPSED_COOKIE}=([^;]*)`))?.[1];
  const set = parseToggled(current);
  if (toggled) set.add(id);
  else set.delete(id);
  document.cookie = `${COLLAPSED_COOKIE}=${[...set].join(".")}; path=/; max-age=31536000; samesite=lax`;
}

/** A native <details>, so toggling needs no state; the cookie it writes matches what a later render shows. */
export function GroupDetails({
  id,
  icon,
  label,
  count,
  open,
  defaultOpen,
  dim,
  className,
  headClassName,
  children,
}: {
  id: string;
  icon?: React.ReactNode;
  label: React.ReactNode;
  count?: React.ReactNode;
  open: boolean;
  defaultOpen: boolean;
  dim?: boolean;
  className?: string;
  headClassName?: string;
  children: React.ReactNode;
}) {
  return (
    <details className={cn(styles.group, dim && styles.dim, className)} open={open} onToggle={(e) => writeToggled(id, e.currentTarget.open !== defaultOpen)}>
      <summary className={cn(styles.head, headClassName)}>
        {icon ? (
          <span className={styles.slot}>
            {icon}
            <ChevronRight size={14} className={styles.chevron} aria-hidden />
          </span>
        ) : (
          <ChevronRight size={14} className={styles.chevron} aria-hidden />
        )}
        <span className={styles.label}>{label}</span>
        {count != null ? <span className={styles.count}>{count}</span> : null}
      </summary>
      {children}
    </details>
  );
}
