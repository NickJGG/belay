<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Belay web

The Belay app: this Next app, served by `belay serve` on 4747. Everything it reads lives in the data dir
(`~/Belay`, `BELAY_DATA`): grills in `grills/<slug>/`, lesson folders in `lessons/`, the start queue and restart marker
in `.run/`. Courses are in `~/Learning`, and the Claude Code channel bridge ships as the `belay` plugin at the repo root. Vocabulary is in `CONTEXT.md` beside this file (the CLI's glossary is the
root `CONTEXT.md`).

## Commands
All run in `web/`; `bridge/` and `plugin/` are at the repo root.
- `pnpm typecheck`, `pnpm lint`, `pnpm test:site`, `pnpm test:plugin`.
- `pnpm build:bridge` compiles `../bridge/*.mts` into `../plugin/bridge/*.mjs`. Run it after every bridge change and
  commit the output: the plugin runs the compiled files in place, so a stale `.mjs` ships the old bridge.
- `pnpm test:bridge` builds first; its lifecycle test drives the compiled server over stdio.
- After a fresh clone, run `npm install` in `plugin/`: nothing else installs the plugin's runtime deps.

## Layout
- `src/components/layout/shell.tsx` is every page's chrome, mounted by the root layout: the sidebar (`rail`, pinned
  open or collapsed to icons), the live Tabs, the Drawer and, on phones, the dock (`site-nav`) and Strip. Pages pass
  their project or course and section (a Reading page's section rows, `lib/sidebar.ts`) through `<ShellSlot>`, and a
  Workspace may pass its own `pane`, drawn in the rail's place (a grill's Outline, `session/outline.tsx`). The Drawer's conversation is `live-provider.tsx`'s.
- `layout/palette.tsx` is belay's cmdk command palette, mounted by the shell. A page lists its own commands first with
  `<PageCommands>` (an issue's status keys and !, a grill's resume command, a course's starts, a lesson note's Resume
  conversation). Its New issue and Log what you did reach
  the project page's form through `belay/intents.ts`.
- Home (`/`) is In flight, from the CLI's `inFlight` (`homeFlight` in `data.ts`), then Your courses (`homeCourses`).
- Course pages: `/courses` (course cards), `/courses/<c>` (Syllabus) and its tabs `{map,lessons,notes,
  misconceptions,cards,work}` under one layout holding the course header, and the detail pages
  `/courses/<c>/{knowledge,lessons,sources}/<x>`. Their pieces are in `src/components/course/`; their data is
  `lib/course-data.ts` over `lib/courses.ts`, which loads the learn skill's `scripts/courses.js` and `cards.js`
  (formats.md is the contract). The site writes only `work/` (`/api/work`), and a lesson note's Resume conversation
  (`app/course-actions.ts`) opens `claude --resume` in Windows Terminal.
- Lessons: a live lesson's Tab opens `/courses/<c>/now`, its Workspace. Start buttons
  (`course/start-buttons.tsx`) POST `/api/lesson/start`, which queues the routine (`lib/start-queue.ts`) and asks a
  live lesson to restart into it; Follow along (`live/follow.tsx`) follows the lesson's `show`s (`lib/lesson.ts`).
- Belay's pages: `/p` (project cards), `/p/<key>` (Issues; `?view=ideas`), `/p/<key>/{grills,activity,logs}` under
  one layout holding the project header, `/i/<id>` and `/l/<day>/<n>?at=`. Their pieces are in
  `src/components/belay/`; their writes are the server actions in `src/app/actions.ts`, each a thin wrapper around
  one CLI op on a fresh strict `Ctx`.
- At the repo root: `bridge/`: the MCP server's TypeScript source. `plugin/`: the plugin (`.claude-plugin/plugin.json` declares the
  `belay` MCP server and binds a `channels` entry to it). `.claude-plugin/marketplace.json`: the local `belay`
  marketplace listing it.
- `plugin/SKILL.md` is the `/grill` skill; from a marketplace it shows as `/belay:grill`.
- `plugin/references/session-format.md` defines `session.json`, `chat.jsonl` and the mock patch order.
- `belay claude` / `belay learn` (`../src/launch.ts`) start `claude` with
  `--dangerously-load-development-channels plugin:belay@belay`, `--disallowedTools` for tools they never use, and `BELAY_CHANNEL=1` (the skills' "channel loaded"
  check); `belay learn` starts it in `~/Learning`. Both relaunch `claude` while `<data>/.run/restart` exists when it
  exits (a lesson's restart). `../scripts/accept-dev-channels.ps1` presses Enter on the dev-channels dialog.

## Invariants
- Keep the repo root's SDK and zod dev deps (`../package.json`) on the versions in `plugin/package.json`: the
  bridge is typechecked against the root's copies but runs against the plugin's.
- The site runs on port 4747 (`belay serve`), the only site origin the bridge accepts; changing it also needs
  `BELAY_SITE_PORT`.
- Keep `src/lib/` data modules (`sessions`, `projects`, `issues`, `frontmatter`, `upstream`, `format`, `shell`,
  `course-art`, `belay-view`, `watch-paths`, `courses`, `course-paths`, `course-home`, `course-nav`, `wiki-target`,
  `work`, `session-log`, `routines`, `lesson`, `start-queue`, `sidebar`) free of `server-only` and `@/` imports: `pnpm test:site` runs them under plain
  `node --test`, which resolves neither. They may import the CLI's `../../../src/*.ts`.
- Client components take only types from `lib/data`, `lib/belay-view`, `lib/courses`, `lib/course-home` and the CLI's
  `store.ts`, whose runtime pulls in `node:fs`. Values they need live in import-free modules: `lib/hrefs`,
  `lib/collapsed`, `lib/course-nav`, `lib/routines`, `lib/lesson`, and the CLI's `keys`, `picker` and `time`.
- Every write goes through a CLI op (via `actions.ts`), and adding one to the app means adding it to the CLI first.
- `src/proxy.ts` applies belay's host guard (`src/guard.ts`) to every request but `/api/usage`, which checks its own.
- `src/lib/session-doc.ts`'s `decisions`/`context` mirror `plugin/scripts/session.js`, and a test checks that
  they agree, so change both together.
- Bridge tokens stay on the server. The browser uses `/api/events` and `POST /api/s/<slug>/send`, which adds the
  slug and token and forwards to the bridge.
- Mock frames are same-origin srcdoc iframes, and comment mode (`pin.ts`) reaches into them, so a `sandbox`
  attribute without `allow-same-origin` breaks comments.
- Key presses don't leave an iframe, so frames re-dispatch theirs to the page's document, where `Ctrl K` (the command
  palette, `GET /api/search`) listens too. `p` is Pick, so an option keyed `p` has no shortcut.
- Follow along never jumps while a comment or pick note is being written: the jump would discard it. A lesson's
  Follow along waits in its pill while a text field has text.
- `bridge/lesson.mts`'s start queue and `lib/start-queue.ts` agree on `<data>/.run/start.json`, and the restart marker
  is `<data>/.run/restart` for the bridge and `src/launch.ts` alike.

## Plugin loading
The marketplace was added from a local path (the belay repo root), so the plugin loads in place from `plugin/`: edits take effect at
the next session start or `/reload-plugins`, with no reinstall. It is enabled at user scope, so its MCP server
starts in every session; the channel only registers in sessions launched with the dev-channels flag.

## Channel transport (launch-tested on Claude Code 2.1.309)
- A plugin `channels` entry loads via `--dangerously-load-development-channels plugin:belay@belay`.
- `notifications/claude/channel` pushes reach an idle session, and Claude acts on them.
- Tools announced later with `tools/list_changed` become callable.
- Protocol `2025-11-25` negotiates with SDK 1.32.1; `MCP_PROTOCOL_NEGOTIATION=legacy` is not needed.
- The permission relay works: a `permission_request` reaches the bridge while a prompt is open, and a
  `notifications/claude/channel/permission` verdict from the site answers it.

## Bridge protocol
Idle, the server lists only `attach`: a grill by `slug` (`/grill`) or a lesson by `course` (the `/learn` skills).
Attaching binds a free 127.0.0.1 port with a fresh token, writes `bridge.json` in the session's folder
`{port, token, sessionId, pid, at}`, and announces `reply`, `show`, `choice` and `detach`, plus `restart` for a
lesson. The site's hub holds an upstream to every `bridge.json`'s `/events`; a session is Live while that stream is
open. Message kinds live in `bridge/protocol.mts`, event types in `bridge/http.mts`.
- Lessons (`bridge/lesson.mts`): attach makes up `lesson-<course>-<yyyymmdd>-<hhmm>` and writes its
  `<data>/lessons/<slug>/session.json` (`kind: "lesson"`). `show` takes `{target: claim|whiteboard|work|source,
  topic?, id?, path?}`, checked against the course folder; the upstream keeps the last one for pages opened later.
  The site sends `attempt` (a `work/` file) and `restart` (a start button). A start: the site writes
  `.run/start.json`; `restart` checks it, writes `.run/restart` and ends `claude` (the parent pid); the
  launcher relaunches; the new bridge, idle in `~/Learning`, sends the queue as a `kind="command"` message.
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
- `sessions.ts` reads `<data>/grills/*`: session.json, else a bare `bridge.json` (in progress), else `<slug>.md`
  frontmatter (`legacy`). A legacy grill is read-only and renders its `.md`, with its old preview at
  `/legacy/sessions/<slug>/preview.html`; the shared shell it loads is served from `web/legacy/`. Lessons come from
  `<data>/lessons/*`. `/api/s/<slug>/*` routes find a slug's folder with `sessionDir` (grills, then lessons).
- The site sends a bridge `X-Belay-Token`, read from that session's `bridge.json`.
- Belay's data comes from the CLI's store through one lenient, request-cached `Ctx` (`belay()` in `data.ts`,
  `BELAY_DATA`); `projects.ts` sorts its projects and files untagged sessions by belay's fuzzy match.
- Live sync: the hub also watches the data dir's issues, projects, log days and `order.yaml` (`belayWatched`) and
  sends a `belay` event, on which `LiveRefresh` re-renders the page, whether a page, the CLI or Claude wrote it.
- Courses live in `~/Learning` (`HANDHOLD_ROOT`). The hub watches its visible course paths (`visibleParts`: never
  `exercises/`, `rubrics/` or dot folders) and sends `course` events; `LiveRefresh` acts on all but `work/`, which
  the Work tab's editor reloads itself.
- Collapsible groups keep the ones toggled from their default in the `belay-collapsed` cookie, so the server
  renders them that way.
- Usage: `~/.claude/statusline.sh` POSTs every tick to `/api/usage` (no token, loopback `Host`, any `Origin`
  refused). The hub's `UsageStore` keeps limits account-wide and context/cache per `session_id`, so a site
  restart leaves the meters blank until the next tick.
- `GET /api/viewers` returns `{pages}`, the hub's listener count (one `/api/events` stream per open page), so
  `/grill` opens the site only when no page is watching.
- Pictures upload as raw bytes to `POST /api/s/<slug>/images` (same-origin, PNG/JPEG/GIF/WebP, 10 MB) into
  `images/`; `GET`/`DELETE /api/s/<slug>/images/<name>` serve and remove one, and a name `chat.jsonl` uses can't be deleted.
- The shell keeps `belay:sidebar` (collapsed per page kind), `belay:tab` (the selected Tab), `belay:tabs` (Tab
  order), `belay:seen` (Tabs opened in this browser; a first visit seeds it with what's live), `belay:drawer` and
  `belay:outline` (a grill's Outline expanded) in localStorage. Per-session UI state is in `belay:session:<slug>`; the view stays in the hash (`#current`,
  `#today`, `#q-<n>`).
