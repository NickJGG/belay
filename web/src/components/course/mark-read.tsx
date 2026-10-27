"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { toastError } from "@/components/belay/toaster";
import { Button, type ButtonVariant } from "@/components/ui/button";

/** Marks a source's reading done in every unit that lists it, then re-renders the page. */
export function MarkRead({ course, source, variant = "default" }: { course: string; source: string; variant?: ButtonVariant }) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const mark = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/courses/${encodeURIComponent(course)}/read`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ source }),
      });
      const j = (await r.json().catch(() => ({}))) as { error?: string };
      if (!r.ok) return toastError(j.error ?? `Couldn't mark it read (${r.status})`);
      router.refresh();
    } catch (err) {
      toastError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Button variant={variant} size="sm" onClick={mark} disabled={busy}>
      Mark read
    </Button>
  );
}
