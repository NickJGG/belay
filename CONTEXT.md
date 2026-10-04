# Glossary

**Project** — An explicitly registered unit of work (`projects/<key>.md`). It has a `key` of 3–4 letters that is also the task-ID prefix, Linear/JIRA style (`ELV` → `ELV-12`). `project add` derives it from the name (3 letters, 4 only on a clash) unless one is given, and `project rekey` renames it along with every task ID. Keys and IDs are uppercase in the data, lowercase in file names, and case-insensitive when typed. A project also has a name, one or more absolute `paths` used to map a working directory to the project, and a status: `active`, `paused` or `archived`. Repos that aren't registered don't exist as far as the tracker is concerned.

**Group** — An optional label that clusters related projects for display, e.g. "PZ Mods". It's only a label: each mod in the group is still its own project with its own tasks.

**Focus** — A flag on 1–3 active projects marking what this week is about. `tracker next` lists ready tasks from focus projects only, unless you pass `--all`.

**Task** — One deliverable in a project (`tasks/<key>-<n>.md`). Its lifecycle is `idea → todo → doing → done`, plus `dropped` for deliberate abandonment. Deleting a task is different: it erases junk that shouldn't stay on record. Blocking is a field (`blocked_by`), not a status. A task may link to the grill session (`grill`) and plan (`plan`) it came from.

**Idea** — A task in the `idea` status: a captured but uncommitted inbox item. Claude may capture ideas on its own (`source: claude`). Promoting an idea to `todo` is a commitment, so the user decides.

**Ready** — Derived, never stored: a `todo` task whose `blocked_by` tasks are all `done` or `dropped`.

**Digest** — The ~5-line summary `tracker digest` prints from the SessionStart hook when a session opens inside a registered project: its `doing` tasks, its ready tasks, its last 3 sessions, and its grill sessions not yet linked to a task: those tagged with the project (in-progress ones by slug), plus untagged older ones that mention the project's distinctive words. Outside a registered project it prints nothing.

**Session** — One Claude Code transcript (`~/.claude/projects/<encoded cwd>/<id>.jsonl`). It belongs to the project its *launch* cwd maps to. Its commits are those committed under the project's paths between its first and last timestamps. Read only, never stored.

**Grill session** — A persisted `/grill` interview (`~/.claude/skills/grill/sessions/<slug>.md`). New sessions are tagged with the cwd's project (`project: <key>`, via `tracker project which`); older ones are untagged. Accepting a grill's plan creates linked `todo` tasks (`grill`, `plan`). The tracker only reads these files.

**Dashboard** — The local web view that `tracker serve` opens. The home page has the Next panel and the project list, and each project gets a board plus its re-entry history. It's where the user curates and triages tasks: it edits every task field except `project`, `grill` and `plan`, edits projects' name, group, status and focus, and can delete tasks. Its data operations are a subset of the CLI's, so registering projects stays CLI-only.
