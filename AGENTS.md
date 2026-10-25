# belay

A personal issue tracker for Claude Code work, and the Belay app around it: a CLI (`src/`), the local Next.js app (`web/`, Sear's grill site merged with belay's dashboard), and the `sear` Claude Code plugin with its channel bridge. Domain terms are defined in `CONTEXT.md`; the app's vocabulary is in `web/CONTEXT.md`.

## Don't start servers

Never run `belay serve`, `pnpm dev`, `next dev` or `next start`. The user starts and stops servers. When something needs checking in the browser, say what to look at and let the user run it.

## Layout

- `src/` is the CLI. It runs on Node 24 type-stripping (no build step) with TS 7, and `yaml` is its only runtime dependency. `belay digest` runs in every SessionStart hook and `belay statusline` after nearly every message, so a heavier dependency or a build step slows every session.
- `web/` is a separate Next 16 package (pnpm) with its own `package.json` and TS 5. It imports `../src/*.ts` directly. `belay serve` builds and starts it on 4747. `web/AGENTS.md` covers the app, bridge and plugin; its top block is managed by Next: read the docs it points to before writing Next code, because this Next version differs from what you know.
- `bridge/` is the channel bridge's TypeScript source, compiled into `plugin/bridge/` by `pnpm build:bridge` in `web/`. `plugin/` is the `sear` plugin (the `/sear` skill and its MCP server), listed by the local marketplace in `.claude-plugin/`. `launcher/` holds the `sear` launchers. The root's MCP SDK and zod dev deps are only for typechecking the bridge.

## Rules

- Every data write goes through `src/ops.ts`. Each op re-reads the file just before saving it. A write that bypasses the ops can overwrite a note Claude or the CLI appended a moment earlier.
- The dashboard's data operations are a subset of the CLI's (the user's rule). Before adding a write to the dashboard, add it to the CLI.
- Put logic in `ops.ts` or pure helpers in `src/` and test it with `node:test`. There are no UI tests, so logic inside components or server actions goes untested.
- Never test against the real data dir (`~/Belay`). It isn't in git, so a bad write can't be undone. Point `BELAY_DATA` at a temp copy.

## Checks

- Repo root: `npm test` and `npm run typecheck`
- `web/`: `pnpm typecheck`, `pnpm lint`, `pnpm test:site`, `pnpm test:bridge`, `pnpm test:plugin`
- After a fresh clone: `npm install` at the root and in `plugin/`, `pnpm install` in `web/`.
