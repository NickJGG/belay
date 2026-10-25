# belay

A personal issue tracker for Claude Code work: the `belay` CLI (`src/`) and a local dashboard (`web/`). Run `belay help` for the commands.

## Dashboard setup

The dashboard is a separate Next.js package in `web/` (pnpm). Install its dependencies once:

```sh
cd web
pnpm install
```

Then `belay serve [--port <n>] [--no-open]` starts it at http://127.0.0.1:4747/. The first run builds it with `next build`. Later runs start straight away, rebuilding only when a file under `web/` or `src/` is newer than the last build. Re-run `pnpm install` in `web/` after its `package.json` changes.

With `--dev` it runs `next dev` instead of building, so edits to `web/` or `src/` show up without a restart.

For development, `pnpm dev` in `web/` serves on port 4747. Point `BELAY_DATA` at a copy of `~/Belay` so experiments can't touch the real data.
