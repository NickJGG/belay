/**
 * The attached bridge's HTTP side, on a free 127.0.0.1 port for one slug and one token:
 *
 *   POST /message  (X-Belay-Token)           a `Message` (see protocol.mts and kinds/), read by `parse` → `onMessage`
 *   GET  /events   (X-Belay-Token or ?token)  SSE of `BridgeEvent`s; `snapshot()` first
 *   GET  /status                            up, slug, connected
 *
 * Every request must carry a loopback Host; one with an Origin must come from the Belay site.
 */
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import type { KindEvent, Message } from "./kinds/index.mts";
import { hostAllowed, MAX_BODY, originAllowed, tokenMatches } from "./protocol.mts";
import type { Step, Tone } from "./transcript.mts";

export type BridgeEvent =
  | { type: "reply"; text: string }
  | { type: "choice"; id: string; prompt: string; options: string[] }
  | { type: "permission"; request_id: string; tool_name: string; description: string; input_preview: string; mode?: string }
  | { type: "verdict"; request_id: string; behavior: "allow" | "deny" }
  | { type: "working"; on: boolean }
  | KindEvent
  | { type: "session"; slug: string; sessionId: string | null }
  | { type: "disconnected"; slug: string; sessionId: string | null }
  | ({ type: "step" } & Step)
  | { type: "result"; id: string; meta: string; tone?: Tone }
  | { type: "turn"; start: string; steps: Step[]; ms: number; interrupted?: true }
  | { type: "steps"; start: string; steps: Step[] };

/** `onMessage` resolves to an error for the site (status 409) or null once forwarded. */
export type HttpOptions = {
  slug: string;
  token: string;
  origins: string[];
  parse: (body: string) => Message | null;
  onMessage: (m: Message) => Promise<string | null>;
  snapshot: () => BridgeEvent[];
  status: () => Record<string, unknown>;
};

export type BridgeHttp = {
  port: number;
  broadcast: (e: BridgeEvent) => void;
  clients: () => number;
  close: () => Promise<void>;
};

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size <= MAX_BODY) chunks.push(c);
      else chunks.length = 0;
    });
    req.on("end", () => resolve(size > MAX_BODY ? null : Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export async function startHttp(o: HttpOptions): Promise<BridgeHttp> {
  const clients = new Set<ServerResponse>();
  let port = 0;

  function send(req: IncomingMessage, res: ServerResponse, status: number, body: unknown) {
    res.writeHead(status, { "Content-Type": "application/json", ...cors(req) });
    res.end(JSON.stringify(body));
  }

  const cors = (req: IncomingMessage): Record<string, string> =>
    req.headers.origin
      ? { "Access-Control-Allow-Origin": req.headers.origin, Vary: "Origin" }
      : {};

  async function onMessage(req: IncomingMessage, res: ServerResponse) {
    if (!tokenMatches(req.headers["x-belay-token"], o.token)) return send(req, res, 401, { error: "bad or missing X-Belay-Token" });
    if (!String(req.headers["content-type"]).startsWith("application/json")) {
      return send(req, res, 415, { error: "expected application/json" });
    }
    const body = await readBody(req);
    if (body === null) {
      res.setHeader("Connection", "close");
      return send(req, res, 413, { error: "body too large" });
    }
    const m = o.parse(body);
    if (!m) return send(req, res, 400, { error: "not a valid Belay message" });
    if (m.slug !== o.slug) return send(req, res, 409, { error: `this session is attached to ${o.slug}`, attached: o.slug });
    const error = await o.onMessage(m);
    if (error) return send(req, res, 409, { error });
    send(req, res, 200, { ok: true });
  }

  function onEvents(req: IncomingMessage, res: ServerResponse, url: URL) {
    const got = req.headers["x-belay-token"] ?? url.searchParams.get("token") ?? "";
    if (!tokenMatches(got, o.token)) return send(req, res, 401, { error: "bad or missing token" });
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...cors(req),
    });
    res.write(": connected\n\n");
    for (const e of o.snapshot()) res.write(`data: ${JSON.stringify(e)}\n\n`);
    clients.add(res);
    req.on("close", () => clients.delete(res));
  }

  const server = createServer((req, res) => {
    if (!hostAllowed(req.headers.host, port)) return send(req, res, 421, { error: "unexpected Host" });
    if (!originAllowed(req.headers.origin, o.origins)) return send(req, res, 403, { error: "origin not allowed" });
    const url = new URL(req.url ?? "/", "http://x");
    const route = `${req.method} ${url.pathname}`;
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        ...cors(req),
        "Access-Control-Allow-Methods": "GET, POST",
        "Access-Control-Allow-Headers": "Content-Type, X-Belay-Token",
      });
      res.end();
    } else if (route === "POST /message") {
      onMessage(req, res).catch((err) => send(req, res, 500, { error: String(err?.message ?? err) }));
    } else if (route === "GET /events") {
      onEvents(req, res, url);
    } else if (route === "GET /status") {
      send(req, res, 200, { up: true, slug: o.slug, ...o.status() });
    } else {
      send(req, res, 404, { error: "not found" });
    }
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve());
  });
  port = (server.address() as { port: number }).port;

  return {
    port,
    broadcast(e) {
      const chunk = `data: ${JSON.stringify(e)}\n\n`;
      for (const res of clients) res.write(chunk);
    },
    clients: () => clients.size,
    close() {
      for (const res of clients) res.end();
      clients.clear();
      const closed = new Promise<void>((resolve) => server.close(() => resolve()));
      server.closeAllConnections();
      return closed;
    },
  };
}
