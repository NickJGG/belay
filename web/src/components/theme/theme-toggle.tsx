"use client";

import * as React from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";

const noopSubscribe = () => () => {};

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const mounted = React.useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
  const isDark = resolvedTheme === "dark";
  const next = isDark ? "light" : "dark";
  const ready = mounted && resolvedTheme !== undefined;

  return (
    <Button
      variant="ghost"
      size="icon-sm"
      aria-label={ready ? `Switch to ${next} theme` : "Toggle theme"}
      title={ready ? `Switch to ${next} theme` : undefined}
      onClick={() => ready && setTheme(next)}
      suppressHydrationWarning
    >
      {ready ? (
        isDark ? <Sun size={16} aria-hidden /> : <Moon size={16} aria-hidden />
      ) : (
        <span style={{ display: "inline-block", width: 16, height: 16 }} aria-hidden />
      )}
    </Button>
  );
}
