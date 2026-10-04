'use client';
import { useSyncExternalStore } from 'react';
import ui from './ui.module.css';

export const Kbd = ({ children }: { children: React.ReactNode }) => <kbd className={ui.kbd}>{children}</kbd>;

/** `⌘` on Apple platforms, `Ctrl` elsewhere and during server render. */
export function useModKey(): string {
  return useSyncExternalStore(
    () => () => {},
    () => (/Mac|iPhone|iPad/.test(navigator.platform) ? '⌘' : 'Ctrl'),
    () => 'Ctrl',
  );
}
