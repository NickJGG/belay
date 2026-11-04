<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Belay web

The Belay app: this Next app, served by `belay serve` on 4747. Everything it reads lives in the data dir
(`~/Belay`, `BELAY_DATA`): grills in `grills/<slug>/`, saved reviews in `reviews/<id>/`, lesson folders in `lessons/`, the start queue and restart marker
in `.run/`. Courses are in `~/Learning`, and the Claude Code channel bridge ships as the `belay` plugin at the repo root. Vocabulary is in `CONTEXT.md` beside this file (the CLI's glossary is the
root `CONTEXT.md`).

## Commands
All run in `web/`; `bridge/` and `plugin/` are at the repo root.
- `pnpm typecheck`, `pnpm lint`, `pnpm test:site`, `pnpm test:plugin`. The site's tests include each extension's
  `test/site/`, the bridge's its `test/bridge/` and the plugin's its `test/plugin/`. `pnpm lint` covers only `web/`, not
  `../extensions/*/web/`.
- `pnpm build:bridge` compiles `../bridge/*.mts` and `../bridge/kinds/*.mts` into `../plugin/bridge/`, and each
  extension's `../extensions/<id>/bridge/*.mts` into `../plugin/extensions/<id>/bridge/`. Run it after every bridge change and
  commit the output: the plugin runs the compiled files, so a stale `.mjs` ships the old bridge.
- `pnpm test:bridge` builds first; its lifecycle test drives the compiled server over stdio.
- `pnpm dev` runs `../scripts/generate.ts --watch`, which writes the generated extension files, then runs `next dev` and
  regenerates as `extensions/` changes.
- After a fresh clone, run `npm install` in `plugin/`: nothing else installs the plugin's runtime deps.

## Layout
- `src/components/layout/shell.tsx` is every page's chrome, mounted by the root layout: the sidebar (`rail`, pinned
  open or collapsed to icons), the live Tabs, the Drawer and, on phones, the dock (`site-nav`) and Strip. Pages pass
  their project or owned place (a course) and section (a Reading page's section rows, `lib/sidebar.ts`) through `<ShellSlot>`, and a
  Workspace may pass its own `pane`, drawn in the rail's place (a grill's Outline, its `_components/outline.tsx`). Both sit in `side-pane.tsx`'s shared container, so they share its width, collapse and tips. The Drawer's conversation is `live-provider.tsx`'s.
- `layout/palette.tsx` is belay's cmdk command palette, mounted by the shell. A page lists its own commands first with
  `<PageCommands>` (an issue's status keys and !, a grill's resume command, a course's starts, a lesson note's Resume
  conversation). Its New issue and Log what you did reach
  the project page's form through `belay/intents.ts`.
- Home (`/`) is a header with the 5h/7d usage rings (seeded by `homePulse` in `data.ts`, then the hub's account-wide
  `limits` events) and the CLI's two-week `activityGrid`, then In flight: the CLI's `inFlight` doing issues and the extensions' groups (`homeFlight`),
  then Your courses (`homeCourses`: the 3 most urgent, See all to /learn), then Recent activity: the CLI's `activity` with `doneOnly`, across projects
  (`homeActivity`, `?days=` as a project's Activity).
- Course pages: `/learn` (a calendar across courses, then the course cards), `/learn/<c>` (Overview: a hero with the current unit, the step its
  journey lights and the journey, a calendar, the goal) and its tabs `{syllabus,map,lessons,notes,misconceptions,cards,work}` under one layout holding
  the course header, and the detail pages `/learn/<c>/{knowledge,lessons,sources}/<x>`. They are learn's, all in
  `../extensions/learn/web/` (stubbed into `src/app/(browse)/(learn)/`): pages, `api/`, `_components/` and `_lib/` (`_x` below means that folder). Their data is
  `_lib/course-data.ts` over `_lib/courses.ts`, which loads the learn plugin's
  `scripts/courses.js` and `cards.js` (`../extensions/learn/plugin/scripts/`) (formats.md is the contract). The site never edits course Markdown: it writes
  `work/` (`/api/work`) and otherwise only runs the learn plugin's own write ops (Mark read, `/api/courses/<c>/read`
  → `courses.js read`). A lesson note's Resume conversation (`_lib/course-actions.ts`) opens `claude --resume` in
  Windows Terminal through `lib/terminal.ts`'s `openTerminal`, which hands back the command to copy when no terminal
  starts; review's Apply on a closed review (`extensions/review/web/_lib/review-actions.ts`) uses it too.
- Lessons: a live lesson's Tab opens `/learn/<c>/now`, its Workspace. Start buttons
  (`_components/start-buttons.tsx`) POST `/api/lesson/start`, which queues the routine (`_lib/start-queue.ts`) and asks a
  live lesson to restart into it; Follow along (`_components/follow.tsx`) follows the lesson's `show`s (`_lib/lesson.ts`).
- Grill pages: `/s/<slug>` (a grill's Workspace), `/legacy/…` (a legacy grill's old preview) and
  `/api/s/<slug>/files/<name>` (its mock files) are grill's, in `../extensions/grill/web/` (stubbed into
  `src/app/(browse)/(grill)/` by the generator), with its components (the
  session workspace, bar, frame, outline and pin, the Grills list and row) and `_lib/` (its sessions, `filing` under
  projects, `issues` for the stages, `session-doc`, `mock`, `behaviours`, and `detail.server.ts` for the page's data).
  The Drawer and `session.module.css` (buttons, Drawer, meters) stay core; the workspace's rules are in its
  `_components/workspace.module.css`. A CSS module can't name another's classes, so the two never share a selector.
- Review pages: `/r/<id>` (a saved review's Workspace: its Overview, a finding at `#f-<n>`, or its stage timeline while
  it runs), `/r/<id>/lines` (read-only context lines for Show 20 lines, read live from the reviewed repo, only for a
  finding with a saved hunk) and the Reviews section (`/p/<key>/reviews`, a Needs you · Done · All filter) are review's, in
  `../extensions/review/web/`. Its `_lib/` holds `view` (groups, chips, segments, list rows and filters, the timeline),
  `sessions` (saved reviews as sessions, over `cli/reviews.ts`), `detail.server.ts` and `review-actions.ts`: Decide and
  Track wrap the same ops as `belay review decide|track` (`cli/ops.ts`), then tell a live session; Apply sends `apply`,
  or with no session opens a terminal. The diff's colours are in its `_components/review.module.css`, its highlighting
  is `syntax.ts`'s `highlightFileLines`.
- Belay's pages: `/p` (project cards), `/p/<key>` (Issues; `?view=ideas`), `/p/<key>/{activity,logs}` and the
  extensions' sections (`/p/<key>/[section]`, grill's Grills) under one layout holding the project header, `/i/<id>` and `/l/<day>/<n>?at=`. Their pieces are in
  `src/components/belay/`; their writes are the server actions in `src/app/actions.ts`, each a thin wrapper around
  one CLI op on a fresh strict `Ctx`.
- Settings (`/settings`, core): Glow, and a card per bundled extension (`components/settings/`). An installed one's
  switch is the `setExtensionOn` action over the CLI's `switchExtension`, refusing Off while one of its sessions is
  attached; Install and Uninstall start a job (`lib/extension-job.ts`) over the CLI's `src/install.ts` ops, which the
  page polls (`extensionJob`). Under `belay serve` (`BELAY_SERVE`) a finished job writes `.run/serve-restart` and exits
  the server, and the page reloads once `GET /api/boot` answers with a new process's id.
- At the repo root: `bridge/`: the MCP server's TypeScript source. `plugin/`: the core plugin (`.claude-plugin/plugin.json` declares the
  `belay` MCP server and binds a `channels` entry to it; no skills). `.claude-plugin/marketplace.json`: the local `belay`
  marketplace listing it and each extension's plugin.
- `extensions/grill/plugin/` is the `grill` plugin; its `SKILL.md` is the `/grill:grill` skill.
- `extensions/learn/plugin/` is the `learn` plugin: `/learn:learn` (its `SKILL.md`) and `/learn:{build,review,checkpoint,status}` (`skills/`). Its
  scripts are CommonJS, so it and `../extensions/learn/test/plugin/` carry a `{"type": "commonjs"}` package.json.
- `extensions/grill/plugin/references/session-format.md` defines `session.json`, `chat.jsonl` and the mock patch order.
- `belay claude` / `belay learn` (`../src/launch.ts`) start `claude` with
  `--dangerously-load-development-channels plugin:belay@belay`, `--disallowedTools` for tools they never use, and `BELAY_CHANNEL=1` (the skills' "channel loaded"
  check) and `BELAY_REPO` (the clone, for the bridge); `belay learn` starts it in `~/Learning`. Both relaunch `claude` while `<data>/.run/restart` exists when it
  exits (a lesson's restart). `../scripts/accept-dev-channels.ps1` presses Enter on the dev-channels dialog.

## Invariants
- Keep the repo root's SDK and zod dev deps (`../package.json`) on the versions in `plugin/package.json`: the
  bridge is typechecked against the root's copies but runs against the plugin's.
- The site runs on port 4747 (`belay serve`), the only site origin the bridge accepts; changing it also needs
  `BELAY_SITE_PORT`.
- Keep the tested data modules free of `server-only` and `@/` imports: `src/lib/`'s (`sessions`, `projects`, `issues`,
  `frontmatter`, `upstream`, `format`, `shell`, `course-art`, `belay-view`, `watch-paths`, `sidebar`, `settings`) and each extension's
  `_lib/` ones (grill's `sessions`, `filing`, `issues`, `flight`, `session-doc`, `mock`, `behaviours`; review's `view`, `sessions`, `manifest`; learn's `courses`, `calendar`, `course-paths`, `course-home`, `course-nav`, `wiki-target`, `work`,
  `session-log`, `routines`, `lesson`, `start-queue`, `run`, `ts-env`). `pnpm test:site` runs `src/lib/test/`
  and `../extensions/*/test/site/` under plain `node --test`, which resolves neither. They may import the CLI's `src/*.ts` by relative path.
- Client components take only types from `lib/data`, `lib/belay-view`, learn's `_lib/courses` and `_lib/course-home`, and the CLI's
  `store.ts`, whose runtime pulls in `node:fs`. Values they need live in import-free modules: `lib/hrefs`, `lib/settings`,
  `lib/collapsed`, grill's `_lib/hrefs`, learn's `_lib/{hrefs,course-nav,calendar,routines,lesson}`, and the CLI's `keys`, `picker` and `time`.
- Every write goes through a CLI op (via `actions.ts`), and adding one to the app means adding it to the CLI first.
- `src/proxy.ts` applies belay's host guard (`src/guard.ts`) to every request but `/api/usage`, which checks its own.
- Grill's `_lib/session-doc.ts`'s `decisions`/`context` mirror its `plugin/scripts/session.js`, and a test checks that
  they agree, so change both together.
- Bridge tokens stay on the server. The browser uses `/api/events` and `POST /api/s/<slug>/send`, which adds the
  slug and token and forwards to the bridge.
- Mock frames are same-origin srcdoc iframes, and comment mode (grill's `_components/pin.ts`) reaches into them, so a `sandbox`
  attribute without `allow-same-origin` breaks comments.
- Key presses don't leave an iframe, so frames re-dispatch theirs to the page's document, where `Ctrl K` (the command
  palette, `GET /api/search`) listens too. `p` is Pick, so an option keyed `p` has no shortcut.
- Follow along never jumps while a comment or pick note is being written: the jump would discard it. A lesson's
  Follow along waits in its pill while a text field has text.
- Learn's `bridge/learn.mts` start queue and its `web/_lib/start-queue.ts` agree on `<data>/.run/start.json`, and the restart marker
  is `<data>/.run/restart` for the bridge and `src/launch.ts` alike.

## Plugin loading
The marketplace was added from a local path (the belay repo root), but Claude Code runs each plugin from a copy in
`~/.claude/plugins/cache/belay/<plugin>/<version>/`: after a change, `claude plugin update belay@belay` (or `grill@belay`, `learn@belay`)
and start a new session. The core plugin is enabled at user scope, so its MCP server starts in every session; the
channel only registers in sessions launched with the dev-channels flag. Since the bridge runs from the cache, it finds
the clone (for `extensions/installed.json`) by `BELAY_REPO`, which `belay claude` sets, else its own folder, else the
`belay` marketplace's directory in `~/.claude/plugins/known_marketplaces.json`; with none it runs core-only and logs why.
An installed extension whose bridge isn't in the cached copy is skipped with a log line until the plugin is updated.

## Channel transport (launch-tested on Claude Code 2.1.309)
- A plugin `channels` entry loads via `--dangerously-load-development-channels plugin:belay@belay`.
- `notifications/claude/channel` pushes reach an idle session, and Claude acts on them.
- Tools announced later with `tools/list_changed` become callable.
- Protocol `2025-11-25` negotiates with SDK 1.32.1; `MCP_PROTOCOL_NEGOTIATION=legacy` is not needed.
- The permission relay works: a `permission_request` reaches the bridge while a prompt is open, and a
  `notifications/claude/channel/permission` verdict from the site answers it.

## Bridge protocol
Idle, the server lists only `attach`: a grill by `slug` (`/grill:grill`), a lesson by `course` (the learn plugin's skills) or a review by `id` (`/review:review`).
Attaching binds a free 127.0.0.1 port with a fresh token, writes `bridge.json` in the session's folder
`{port, token, sessionId, pid, at, wt}`, and announces `reply`, `show`, `choice` and `detach`, plus `restart` for a
lesson. The site's hub holds an upstream to every `bridge.json`'s `/events`; a session is Live while that stream is
open. The core message kinds live in `bridge/protocol.mts`, event types in `bridge/http.mts`.
- Session kinds (loaded by `kinds/index.mts` for each installed extension, from `extensions/<id>/bridge/`): each extension's descriptor (`<id>.mts`, exporting `kind`: INSTRUCTIONS,
  tool JSON, attach arguments, wording) loads at startup, and its runtime (`<id>.runtime.mts`: messages, handlers,
  notifications, files, step labels) on attach. `bridge/settings.mts` reads `settings.yaml`'s `extensions:` as
  `src/extensions.ts` does: INSTRUCTIONS at startup, the tools on every request.
- Lessons (`extensions/learn/bridge/learn.mts`, `learn.runtime.mts`): attach makes up `lesson-<course>-<yyyymmdd>-<hhmm>` and writes its
  `<data>/lessons/<slug>/session.json` (`kind: "lesson"`). `show` takes `{target: claim|whiteboard|work|source,
  topic?, id?, path?}`, checked against the course folder; the upstream keeps the last one for pages opened later.
  The site sends `attempt` (a `work/` file) and `restart` (a start button). A start: the site writes
  `.run/start.json`; `restart` checks it, writes `.run/restart` and ends `claude` (the parent pid); the
  launcher relaunches; the new bridge, idle in `~/Learning`, sends the queue as a `kind="command"` message.
- Reviews (`extensions/review/bridge/review.mts`, `review.runtime.mts`): attach takes the `id` of a saved review
  (`<data>/reviews/<id>/review.json` must exist). The site sends `decide` and `track` after writing them through
  `belay review`, so they only tell a live session; `ask`, `investigate`, `tests`, `apply`, `rerun` and `stop` ask it to act.
- Requests need a loopback `Host`; an `Origin`, if present, must be `http://{127.0.0.1,localhost}:4747`.
- A `choice` or `permission` message must match an open one; a slug mismatch or disconnected session gets 409.
- `focus` is the bridge's own: never forwarded, and answered before the disconnected check. Under Windows Terminal
  (`WT_SESSION`, so `wt` in `bridge.json`), `bridge/focus.mts` runs `plugin/scripts/focus-terminal-tab.ps1`: it
  attaches to claude's console (the bridge's parent) and sets a unique title, which only that tab shows, then selects
  it. If it can't attach, it matches the session title from the transcript. A miss returns the script's reason,
  which the site toasts.
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
- The layer lists (`lib/extensions*.ts`) read each installed extension's manifests from the generated
  `lib/extensions*.generated.ts`.
- Session kinds: each extension's `web/_lib/manifest.ts` adds its permission-card lines, focus parser
  and reattach hint (`lib/extensions.ts`, browser-safe), and its `manifest.server.ts` its sessions' folder and a
  lazily loaded runtime: its session reader, list rows, live Tabs and extra watchers (`lib/extensions.server.ts`).
  Only active kinds count: `sessionRoots()`, `sessionDir`, `data.ts`'s lists and the hub's watchers, which the hub
  starts and stops on the `settings` event. A live session is the first kind's that reads its folder, else grill's while grill is active.
  In the browser, its `_components/manifest.client.tsx` (`lib/extensions.client.ts`) draws its Tabs' title, place and
  mark, its Drawer messages, banners and composer (grill's comment mode), and adds its shell mounts, refresh events
  and provider state (grill's pending comment, a lesson's focus and the start queue), read through its own hooks. The
  root layout passes the active ids; every installed kind's provider stays mounted, and each active kind's entry
  renderers are tried for every session, as before kinds.
- Slots (`lib/slots.ts`): beside its kind, an extension's `manifest.server.ts` exports `slots` with its palette names
  (merged flat into `/api/search`), Home section, activity-grid source, In flight group, Projects cards, project
  section pages (by address segment, rendered by `p/[key]/[section]`) and the plain data its issue facts and actions
  draw from, each loaded on call, and each given only its own kind's listed sessions; its `manifest.client.tsx` exports `slots` with its nav entries, sidebar section
  icons, palette groups, issue facts and ⋯ actions. Its Markdown syntax is a handler (`lib/extensions.markdown.ts`),
  picked by the `id` of the context a page passes `Prose`. Its pure `manifest.ts` names its noun for the site
  description and holds its page rules (`shell`): Workspace pages, Tabs, Not found lines, project sections, a
  pseudo-project (Unfiled, shared by grill and review: its sections are its owners', and their Projects cards merge) and a place's section rows (learn's courses, passed as `<ShellSlot owner>`).
  `lib/shell.ts` and `lib/sidebar.ts` take the active ids, so an inactive extension's addresses get the generic Not
  found line. Only active extensions' slots are used, but Settings lists every bundled one's `name`, `summary` and mark (from its `belay.json`).
- `sessions.ts` reads a session folder in its kind's format: session.json, else a bare `bridge.json` (in progress),
  else, for a grill, `<slug>.md` frontmatter (`legacy`). A legacy grill is read-only and renders its `.md`, with its old preview at
  `/legacy/sessions/<slug>/preview.html`; the shared shell it loads is served from `web/legacy/`. Lessons come from
  `<data>/lessons/*`. `/api/s/<slug>/*` routes find a slug's folder with `sessionDir` (grills, then lessons).
- The site sends a bridge `X-Belay-Token`, read from that session's `bridge.json`.
- Belay's data comes from the CLI's store through one lenient, request-cached `Ctx` (`belay()` in `data.ts`,
  `BELAY_DATA`); `projects.ts` sorts its projects, and grill's `_lib/filing.ts` files untagged grills under them by belay's fuzzy
  match.
- Live sync: the hub also watches the data dir's issues, projects, log days and `order.yaml` (`belayWatched`) and
  sends a `belay` event, on which `LiveRefresh` re-renders the page, whether a page, the CLI or Claude wrote it.
- Courses live in `~/Learning` (`LEARNING_ROOT`). The hub watches its visible course paths (`visibleParts`: never
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
  `belay:outline` (a grill's Outline expanded) in localStorage. Per-session UI state is in `belay:session:<slug>`; the view stays in the hash (`#overview`, `#current`,
  `#today`, `#q-<n>`).
