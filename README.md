# belay

A personal issue tracker for Claude Code work, and the Belay app around it: the `belay` CLI (`src/`), a local app (`web/`) for projects, grills and courses, and the `belay` Claude Code plugin (`plugin/`) that connects sessions to it. Run `belay help` for the commands.

## Plugin setup

The plugin's MCP server is compiled from `bridge/` into `plugin/bridge/` with `pnpm build:bridge` in `web/`; the output is committed. Install its runtime deps once, then add the repo as a local marketplace and install the plugin:

```sh
cd plugin && npm install && cd ..
claude plugin marketplace add .
claude plugin install belay@belay
```

The marketplace loads the plugin in place, so edits take effect at the next session start or `/reload-plugins`.

`belay claude [args]` starts Claude Code with the plugin's channel loaded (the `/grill` skill needs it); `belay learn [args]` does the same in `~/Learning` (`LEARNING_ROOT`) for lessons. Both relaunch Claude when a lesson asks to restart.

## Extensions

Grills and courses are extensions on top of the issue tracker. `belay extension on|off <id>` switches one in `~/Belay/settings.yaml`'s `extensions:` map; grill starts on and learn off. An extension that's off leaves no trace in the site, the CLI or the channel's tools (the channel's instructions drop it at Claude Code's next start), but its data stays where it is. Switching off is refused while one of its sessions is attached, and a session attached before the switch keeps working until it detaches. Learn's switch works today; grill's is always on for now.

## Dashboard setup

The dashboard is a separate Next.js package in `web/` (pnpm). Install its dependencies once:

```sh
cd web
pnpm install
```

Then `belay serve [--port <n>] [--no-open]` starts it at http://127.0.0.1:4747/. The first run builds it with `next build`. Later runs start straight away, rebuilding only when a file under `web/` or `src/` is newer than the last build. Re-run `pnpm install` in `web/` after its `package.json` changes.

With `--dev` it runs `next dev` instead of building, so edits to `web/` or `src/` show up without a restart.

For development, `pnpm dev` in `web/` serves on port 4747. Point `BELAY_DATA` at a copy of `~/Belay` so experiments can't touch the real data.
