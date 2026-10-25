<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Belay web

The Belay app (Sear, belay's dashboard and, later, Topo merged): this Next app, served by `belay serve` on 4747.
Grill data lives in `~/Sear/sessions/<slug>/`, belay's in `~/Belay`, and the Claude Code channel bridge ships as
the `sear` plugin at the repo root. Vocabulary is in `CONTEXT.md` beside this file (the CLI's glossary is the
root `CONTEXT.md`).

## Commands
All run in `web/`; `bridge/` and `plugin/` are at the repo root.
- `pnpm typecheck`, `pnpm lint`, `pnpm test:site`, `pnpm test:plugin`.
- `pnpm build:bridge` compiles `../bridge/*.mts` into `../plugin/bridge/*.mjs`. Run it after every bridge change and
  commit the output: the plugin runs the compiled files in place, so a stale `.mjs` ships the old bridge.
- `pnpm test:bridge` builds first; its lifecycle test drives the compiled server over stdio.
- After a fresh clone, run `npm install` in `plugin/`: nothing else installs the plugin's runtime deps.

## Layout
- `src/components/layout/shell.tsx` is every page's chrome, mounted by the root layout: the sidebar (`site-nav`),
  its collapsed `rail`, the live Tabs, the Drawer and, on phones, the dock and Strip. Pages say where they sit (and
  a Workspace passes its rail rows) through `<ShellSlot>`. The Drawer's conversation is `live-provider.tsx`'s.
- At the repo root: `bridge/`: the MCP server's TypeScript source. `plugin/`: the plugin (`.claude-plugin/plugin.json` declares the
  `sear` MCP server and binds a `channels` entry to it). `.claude-plugin/marketplace.json`: the local `sear`
  marketplace listing it.
- `plugin/SKILL.md` is the `/sear` skill (grill rewritten for Sear); from a marketplace it shows as `/sear:sear`.
- `plugin/references/session-format.md` defines `session.json`, `chat.jsonl` and the mock patch order.
- `launcher/`: `sear.cmd` and `sear` (Git Bash) start `claude` with
  `--dangerously-load-development-channels plugin:sear@sear` and `SEAR_CHANNEL=1` (the skill's "channel loaded"
  check). `accept-dev-channels.ps1` presses Enter on the dev-channels dialog.

## Invariants
- Keep the repo root's SDK and zod dev deps (`../package.json`) on the versions in `plugin/package.json`: the
  bridge is typechecked against the root's copies but runs against the plugin's.
- The site runs on port 4747 (`belay serve`), the only site origin the bridge accepts; changing it also needs
  `SEAR_SITE_PORT`.
- Keep `src/lib/` data modules (`sessions`, `projects`, `issues`, `frontmatter`, `upstream`, `format`, `shell`,
  `course-art`) free of `server-only` and `@/` imports: `pnpm test:site` runs them under plain `node --test`, which
  resolves neither. They may import the CLI's `../../../src/*.ts`.
- `src/proxy.ts` applies belay's host guard (`src/guard.ts`) to every request but `/api/usage`, which checks its own.
- `src/lib/session-doc.ts`'s `decisions`/`context` mirror `plugin/scripts/session.js`, and a test checks that
  they agree, so change both together.
- Bridge tokens stay on the server. The browser uses `/api/events` and `POST /api/s/<slug>/send`, which adds the
  slug and token and forwards to the bridge.
- Mock frames are same-origin srcdoc iframes, and comment mode (`pin.ts`) reaches into them, so a `sandbox`
  attribute without `allow-same-origin` breaks comments.
- Key presses don't leave an iframe, so frames re-dispatch theirs to the page's document, where `Ctrl K` (the search
  palette, `GET /api/search`) listens too. `p` is Pick, so an option keyed `p` has no shortcut.
- Follow along never jumps while a comment or pick note is being written: the jump would discard it.

## Plugin loading
The marketplace was added from a local path (the belay repo root), so the plugin loads in place from `plugin/`: edits take effect at
the next session start or `/reload-plugins`, with no reinstall. It is enabled at user scope, so its MCP server
starts in every session; the channel only registers in sessions launched with the dev-channels flag.

## Channel transport (launch-tested on Claude Code 2.1.309)
- A plugin `channels` entry loads via `--dangerously-load-development-channels plugin:sear@sear`.
- `notifications/claude/channel` pushes reach an idle session, and Claude acts on them.
- Tools announced later with `tools/list_changed` become callable.
- Protocol `2025-11-25` negotiates with SDK 1.32.1; `MCP_PROTOCOL_NEGOTIATION=legacy` is not needed.
- The permission relay works: a `permission_request` reaches the bridge while a prompt is open, and a
  `notifications/claude/channel/permission` verdict from the site answers it.

## Bridge protocol
Idle, the server lists only `attach(slug)`. Attaching binds a free 127.0.0.1 port with a fresh token, writes
`~/Sear/sessions/<slug>/bridge.json` `{port, token, sessionId, pid, at}`, and announces `reply`, `show`, `choice`
and `detach`. The site's hub holds an upstream to every `bridge.json`'s `/events`; a session is Live while that
stream is open. Message kinds live in `bridge/protocol.mts`, event types in `bridge/http.mts`.
- Requests need a loopback `Host`; an `Origin`, if present, must be `http://{127.0.0.1,localhost}:4747`.
- A `choice` or `permission` message must match an open one; a slug mismatch or disconnected session gets 409.
- Pictures: `chat`, `comment` and typed `choice` carry `images` (names in the session's `images/`). The bridge
  409s a missing file and lists absolute paths in the channel text. `IMAGE_NAME`/`MAX_IMAGES` mirror `src/lib/images.ts`.
- Permission requests carry `mode`, read from the transcript's undocumented `permission-mode` entries and
  `permissionMode` fields; no field, no plan-mode line on the card.
- Activity: the bridge tails its session's transcript JSONL every 250 ms, so busy covers terminal turns too. At
  turn end it appends one `steps` entry to `chat.jsonl` after the turn's reply; the drawer's `placeSteps` moves
  it above the reply.
- The connect snapshot (a turn in progress) reaches the hub's upstream, never a page opened later, so the
  upstream keeps the open turn and the page gets it as a prop.
- `/clear` detection: at attach, the bridge locks onto its session id from `~/.claude/sessions/<parent pid>.json`
  (undocumented; the plugin spawns `node` directly, so the parent is `claude.exe`). `/clear` rewrites that id,
  which means `disconnected`; nothing is forwarded until `attach` again (same slug keeps port and token). Without
  the file it falls back to the skill's `${CLAUDE_SESSION_ID}` or the newest transcript in
  `~/.claude/projects/<cwd>/`, and then any newer transcript there disconnects, a second session's included.

## Site data
- `sessions.ts` reads `~/Sear/sessions/*` (session.json, else `<slug>.md` frontmatter, else a bare `bridge.json`)
  and old grill sessions from `~/.claude/skills/grill/sessions` (`SEAR_GRILL_DIR`); Sear wins on a slug in both.
  That folder is a frozen archive read in place: `/grill` is deprecated, and its previews and old plans point there.
  A legacy session renders its `.md`, with its old preview at `/legacy/sessions/<slug>/preview.html`.
- Belay's data comes from the CLI's store through one lenient, request-cached `Ctx` (`belay()` in `data.ts`,
  `BELAY_DATA`); `projects.ts` sorts its projects and files untagged sessions by belay's fuzzy match.
- Usage: `~/.claude/statusline.sh` POSTs every tick to `/api/usage` (no token, loopback `Host`, any `Origin`
  refused). The hub's `UsageStore` keeps limits account-wide and context/cache per `session_id`, so a site
  restart leaves the meters blank until the next tick.
- Pictures upload as raw bytes to `POST /api/s/<slug>/images` (same-origin, PNG/JPEG/GIF/WebP, 10 MB) into
  `images/`; `GET`/`DELETE /api/s/<slug>/images/<name>` serve and remove one, and a name `chat.jsonl` uses can't be deleted.
- The shell keeps `sear:sidebar` (collapsed per page kind), `sear:tab` (the selected Tab) and `sear:drawer` in
  localStorage. Per-session UI state is in `sear:session:<slug>`; the view stays in the hash (`#current`,
  `#today`, `#q-<n>`).
