# Glossary

**Project** — An explicitly registered unit of work (`projects/<key>.md`). It has a `key` of 3–4 letters that is also the issue-ID prefix, Linear/JIRA style (`ELV` → `ELV-12`). `project add` derives it from the name (3 letters, 4 only on a clash) unless one is given, and `project rekey` renames it along with every issue ID. Keys and IDs are uppercase in the data, lowercase in file names, and case-insensitive when typed. A project also has a name, one or more absolute `paths` used to map a working directory to the project, and a status: `active`, `paused` or `archived`. It may declare the `kinds` its log entries can carry. It may set a `color` the Dashboard draws it in (background glow, card cover, lettered tile); without one, a hue derived from its key. Repos that aren't registered don't exist as far as Belay is concerned.

**Group** — An optional label that clusters related projects for display, e.g. "PZ Mods". It's only a label: each mod in the group is still its own project with its own issues.

**Focus** — A flag on active projects marking what this period is about. There is no cap on how many. `belay next` lists ready issues from focus projects only, unless you pass `--all`.

**Log entry** — A dated record of work done on a project, optionally linked to an issue and carrying a kind, count or minutes. Time-first, like a journal; a Comment is context on one issue. Its kind must be one the project declares. Its text is Markdown whose first line is its summary. It's addressed `<day>/<n>`, its 1-based position in that work day's file, so deleting an earlier entry that day shifts it. _Avoid_: did-entry.

**Work day** — The day activity counts toward, ending at 4am local rather than midnight, so late-night work belongs to the day it felt like. Moved and log entries use it; stored timestamps stay real local time.

**Moved** — Derived, never stored: a project moved on a work day if it had an issue transition, a comment, a commit under its paths, or a log entry. A session alone doesn't count.

**Activity** — Derived, never stored: work days newest first, each with its log entries and its issues' latest moves to `doing`, `done` or `dropped`; a run of empty days collapses into a gap. A project's Activity section shows it for that project. Unlike Moved, commits and comments don't appear. _Avoid_: timeline.

**Issue** — One deliverable in a project (`issues/<key>-<n>.md`). Its lifecycle is `idea → todo → doing → done`, plus `dropped` for deliberate abandonment. Deleting an issue is different: it erases junk that shouldn't stay on record. Blocking is a field (`blocked_by`), not a status. An issue may link to the grill session (`grill`) and plan (`plan`) it came from. Each status change is recorded in a hidden `transitions` list (time, from, to, author), which Moved reads. _Avoid_: task.

**Description** — An issue's Markdown body, below its frontmatter (`body` in code, `--body` on the CLI). _Avoid_: notes.

**Comment** — A dated, attributed entry in an issue's log, kept apart from its Description. The Description says what the issue is; comments record what happened: progress, "what's left" handoffs, capture context, system events. Each has a time, an author (`user` or `claude`, never a separate system author) and, for Claude's, the Session it came from. Not a discussion thread: no replies. _Avoid_: note.

**Idea** — An issue in the `idea` status: a captured but uncommitted inbox item. Claude may capture ideas on its own (`source: claude`). Promoting an idea to `todo` is a commitment, so the user decides.

**Ready** — Derived, never stored: a `todo` issue whose `blocked_by` issues are all `done` or `dropped`.

**Blocked** — Derived, never stored: an issue of any status with at least one `blocked_by` issue not `done` or `dropped`. A `doing` issue can be Blocked if it was started anyway. Not the opposite of Ready, which is `todo`-only.

**In flight** — Derived, never stored: every `doing` issue in an active project, plus every in-progress Grill session tagged with a project and not yet linked to an issue.

**Idle** — Derived, never stored: a `doing` issue with no transition, comment or linked log entry for 3 or more work days. Commits don't count, since they map to a project, not an issue.

**Digest** — The ~5-line summary `belay digest` prints from the SessionStart hook when a session opens inside a registered project: its `doing` issues, its ready issues, its last 3 sessions, its grill sessions not yet linked to an issue: those tagged with the project (in-progress ones by slug), plus untagged older ones that mention the project's distinctive words. Outside a registered project it prints nothing.

**Status line** — The row `belay statusline` adds under Claude Code's status line when the cwd is in a registered project: the project's most recently updated `doing` issue (oldest on a tie; `+n` for more, and ⛔ if it has open blockers), or else its next ready issue.

**Session** — One Claude Code transcript (`~/.claude/projects/<encoded cwd>/<id>.jsonl`). It belongs to the project its *launch* cwd maps to. Its commits are those committed under the project's paths between its first and last timestamps. Read only, never stored.

**Grill session** — A persisted `/grill` interview, one folder `<slug>/` in `~/Belay/grills`. A folder with only `<slug>.md` (no `session.json`) is a legacy grill: read-only, never resumed. New sessions are tagged with the cwd's project (`project: <key>`, via `belay project which`); older ones are untagged. Accepting a grill's plan creates linked `todo` issues (`grill`, `plan`) and commits its folder to `~/Belay`'s history once (`belay grill commit`, `planned` grills only); unfinished grills are never committed. Otherwise the CLI only reads these files; the Dashboard shows each at `/s/<slug>`, worked in live while its session is attached, and lists a project's under its Grills section. A legacy folder may also hold its preview doc, `preview.html`, which that page links to.

**Extension** — An optional part of Belay beyond its core project management, such as grill or learn, switched on in `settings.yaml`'s `extensions:` map. It contributes to core-owned surfaces through a manifest, and may own issue frontmatter fields (grill owns `grill` and `plan`). Distinct from the `belay` Claude Code plugin. Its two states are independent: Installed and Enabled. _Avoid_: plugin, module, add-on.

**Installed** — An extension whose deps are installed, whose pages are built into the Dashboard and whose Claude Code plugin is registered. Changing it is a rare, explicit act that takes a rebuild. An uninstalled extension's source may sit on disk, but nothing of it runs.

**Enabled** — An installed extension switched on: the instant runtime toggle. Off hides its pages, nav, search and Tabs; its data stays. _Avoid_: active (an extension is Active while Enabled or while one of its sessions is attached).

**Bundled** — An extension whose source ships in Belay's own repo (`extensions/<id>/`), like grill and learn. Bundled says where it comes from, not whether it's Installed. _Avoid_: built-in.

**Dashboard** — The local Belay app that `belay serve` runs (`web/`; its own vocabulary is in `web/CONTEXT.md`). Projects shows a card per project; each project has Issues (an Issues · Ideas filter, issues in collapsible status groups, + for a new one), Grills, Activity and Logs sections, and each issue (`/i/<id>`) and log entry (`/l/<day>/<n>`) has its own page with a facts table. It's where the user curates and triages issues: it edits every issue field except `project`, `grill` and `plan`, edits projects' name, group, status, focus, kinds and order (Move up/down in a project's ⋯), can delete issues and log entries, and adds log entries from a project's Logs. Pages follow the data dir live, whoever wrote it. Its data operations are a subset of the CLI's, so registering projects stays CLI-only.
