# tracker

A personal issue tracker for Claude Code work: a CLI (`src/`) and a local Next.js dashboard (`web/`). Domain terms are defined in `CONTEXT.md`.

## Don't start servers

Never run `tracker serve`, `npm run dev`, `next dev` or `next start`. The user starts and stops servers. When something needs checking in the browser, say what to look at and let the user run it.

## Layout

- `src/` is the CLI. It runs on Node 24 type-stripping (no build step) with TS 7, and `yaml` is its only runtime dependency. `tracker digest` runs in every SessionStart hook and `tracker statusline` after nearly every message, so a heavier dependency or a build step slows every session.
- `web/` is a separate Next 16 package with its own `package.json` and TS 5. It imports `../src/*.ts` directly. `web/AGENTS.md` is managed by Next: read the docs it points to before writing Next code, because this Next version differs from what you know.

## Rules

- Every data write goes through `src/ops.ts`. Each op re-reads the file just before saving it. A write that bypasses the ops can overwrite a note Claude or the CLI appended a moment earlier.
- The dashboard's data operations are a subset of the CLI's (the user's rule). Before adding a write to the dashboard, add it to the CLI.
- Put logic in `ops.ts` or pure helpers in `src/` and test it with `node:test`. There are no UI tests, so logic inside components or server actions goes untested.
- Never test against the real data dir (`~/Tracker`). It isn't in git, so a bad write can't be undone. Point `TRACKER_DATA` at a temp copy.

## Checks

- Repo root: `npm test` and `npm run typecheck`
- `web/`: `npm run typecheck`
