"use client";

import * as React from "react";
import Link from "next/link";
import { useLive } from "@/components/live/live-provider";
import { cn } from "@/lib/utils";
import { focusHash } from "./focus-highlight";
import styles from "./prose.module.css";

/** A `[k:topic^cN]` citation: shows its topic's title and the claim's text on hover, and closes the phone's full-screen Drawer on click. */
export function ClaimChip({ href, claim, children }: { href: string; claim: string; children: React.ReactNode }) {
  const { sheet, setSheet } = useLive();
  const [text, setText] = React.useState<string>();
  const asked = React.useRef(false);

  const load = () => {
    const course = href.match(/^\/learn\/([^/]+)\//)?.[1];
    const [topic, id] = claim.split("^");
    if (asked.current || !course) return;
    asked.current = true;
    fetch(`/api/courses/${course}/claim?${new URLSearchParams({ topic, id })}`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d: { text?: string; title?: string | null } | null) => d?.text && setText(d.title ? `${d.title}\n${d.text}` : d.text))
      .catch(() => {});
  };

  return (
    <Link
      href={href}
      className={cn(styles.cite, styles.claim)}
      data-quote={text}
      onPointerEnter={load}
      onFocus={load}
      onClick={() => {
        if (sheet) setSheet(false);
        const to = new URL(href, location.href);
        if (to.pathname === location.pathname) focusHash(to.hash);
      }}
    >
      {children}
    </Link>
  );
}
