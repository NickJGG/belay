/** Server-sent events: one message per burst of changes in the data dir, naming the task and project IDs touched. */
import { watch } from 'node:fs';
import { dataDir } from '../../../src/config.ts';
import { entityForPath } from '../../../src/store.ts';

export const dynamic = 'force-dynamic';

const DEBOUNCE_MS = 100;
const KEEPALIVE_MS = 25_000;

export function GET(request: Request) {
  const dir = dataDir();
  const encoder = new TextEncoder();
  let cleanup = () => {};

  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      const tasks = new Set<string>();
      const projects = new Set<string>();
      let timer: ReturnType<typeof setTimeout> | undefined;
      let closed = false;

      const send = (chunk: string) => {
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          cleanup();
        }
      };
      const flush = () => {
        timer = undefined;
        send(`data: ${JSON.stringify({ tasks: [...tasks], projects: [...projects] })}\n\n`);
        tasks.clear();
        projects.clear();
      };

      const watcher = watch(dir, { recursive: true }, (_event, file) => {
        const rel = file?.toString();
        const entity = rel ? entityForPath(rel) : undefined;
        if (entity) (entity.kind === 'task' ? tasks : projects).add(entity.id);
        // A null name means the platform couldn't say what changed; settings.yaml carries the theme and accent.
        else if (rel !== undefined && rel !== 'settings.yaml') return;
        clearTimeout(timer);
        timer = setTimeout(flush, DEBOUNCE_MS);
      });
      const keepalive = setInterval(() => send(': ping\n\n'), KEEPALIVE_MS);

      cleanup = () => {
        if (closed) return;
        closed = true;
        watcher.close();
        clearInterval(keepalive);
        clearTimeout(timer);
        try {
          controller.close();
        } catch {}
      };
      request.signal.addEventListener('abort', cleanup);
      send('retry: 1000\n\n');
    },
    cancel() {
      cleanup();
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
