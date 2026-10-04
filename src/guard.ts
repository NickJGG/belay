/**
 * Request guard for the local dashboard. DNS rebinding sends a foreign Host; cross-site form
 * posts send a foreign (or no) Origin.
 */
export function hostAllowed(host: string | undefined, origin: string | undefined, method: string | undefined, port: number): boolean {
  const allowed = [`127.0.0.1:${port}`, `localhost:${port}`];
  if (!allowed.includes(host ?? '')) return false;
  if (method === 'POST' && !allowed.some((h) => origin === `http://${h}`)) return false;
  return true;
}
