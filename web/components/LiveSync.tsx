'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Re-renders the current page whenever the data dir changes, whether the dashboard, the CLI or Claude wrote it. */
export function LiveSync() {
  const router = useRouter();
  useEffect(() => {
    const events = new EventSource('/events');
    let connected = false;
    events.onmessage = () => router.refresh();
    // After a reconnect, changes made while disconnected were never announced.
    events.onopen = () => {
      if (connected) router.refresh();
      connected = true;
    };
    return () => events.close();
  }, [router]);
  return null;
}
