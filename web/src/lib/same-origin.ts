/** Same-origin only: a cross-site form or fetch could otherwise post into the terminal (or a session's folder) through the site. */
export function sameOrigin(request: Request): boolean {
  const origin = request.headers.get("origin");
  const host = request.headers.get("host");
  if (!origin || !host) return false;
  try {
    const o = new URL(origin);
    return o.host === host && ["127.0.0.1", "localhost"].includes(o.hostname);
  } catch {
    return false;
  }
}
