# Glossary

**Project** — An explicitly registered unit of work (`projects/<key>.md`). It has a `key` of 3–4 letters that is also the issue-ID prefix, Linear/JIRA style (`ELV` → `ELV-12`). `project add` derives it from the name (3 letters, 4 only on a clash) unless one is given, and `project rekey` renames it along with every issue ID. Keys and IDs are uppercase in the data, lowercase in file names, and case-insensitive when typed. A project also has a name, one or more absolute `paths` used to map a working directory to the project, and a status: `active`, `paused` or `archived`. It may declare the `kinds` its log entries can carry, and hold a Goal. Repos that aren't registered don't exist as far as Belay is concerned.

**Group** — An optional label that clusters related projects for display, e.g. "PZ Mods". It's only a label: each mod in the group is still its own project with its own issues.

**Focus** — A flag on active projects marking what this period is about. There is no cap on how many. `belay next` lists ready issues from focus projects only, unless you pass `--all`.

**Goal** — An optional expectation on a focus project: a _habit goal_ (move on N days per week), a _quantity goal_ (N log-entry counts of a kind per week, e.g. 10 `applied`), or a _target goal_ (finish the committed issues, `todo`/`doing` plus those done since the goal was set, by a date). Weeks run Monday–Sunday. Ignored while the project is out of focus. A focus project without one is pinned but never nudged.

**Log entry** — A dated record of work done on a project, optionally linked to an issue and carrying a kind, count or minutes. Time-first, like a journal; a Comment is context on one issue. Its kind must be one the project declares. Its text is Markdown whose first line is its summary. It's addressed `<day>/<n>`, its 1-based position in that work day's file, so deleting an earlier entry that day shifts it. _Avoid_: activity, did-entry.

**Work day** — The day activity counts toward, ending at 4am local rather than midnight, so late-night work belongs to the day it felt like. Goals, Moved and log entries use it; stored timestamps stay real local time.

**Moved** — Derived, never stored: a project moved on a work day if it had an issue transition, a comment, a commit under its paths, or a log entry. A session alone doesn't count.

**Issue** — One deliverable in a project (`issues/<key>-<n>.md`). Its lifecycle is `idea → todo → doing → done`, plus `dropped` for deliberate abandonment. Deleting an issue is different: it erases junk that shouldn't stay on record. Blocking is a field (`blocked_by`), not a status. An issue may link to the grill session (`grill`) and plan (`plan`) it came from. Each status change is recorded in a hidden `transitions` list (time, from, to, author), which Moved and target goals read. _Avoid_: task.

**Description** — An issue's Markdown body, below its frontmatter (`body` in code, `--body` on the CLI). _Avoid_: notes.

**Comment** — A dated, attributed entry in an issue's log, kept apart from its Description. The Description says what the issue is; comments record what happened: progress, "what's left" handoffs, capture context, system events. Each has a time, an author (`user` or `claude`, never a separate system author) and, for Claude's, the Session it came from. Not a discussion thread: no replies. _Avoid_: note.

**Idea** — An issue in the `idea` status: a captured but uncommitted inbox item. Claude may capture ideas on its own (`source: claude`). Promoting an idea to `todo` is a commitment, so the user decides.

**Ready** — Derived, never stored: a `todo` issue whose `blocked_by` issues are all `done` or `dropped`.

**In flight** — Derived, never stored: every `doing` issue in an active project, plus every in-progress Grill session tagged with a project and not yet linked to an issue.

**Idle** — Derived, never stored: a `doing` issue with no transition, comment or linked log entry for 3 or more work days. Commits don't count, since they map to a project, not an issue.

**Digest** — The ~5-line summary `belay digest` prints from the SessionStart hook when a session opens inside a registered project: its `doing` issues, its ready issues, its last 3 sessions, its grill sessions not yet linked to an issue: those tagged with the project (in-progress ones by slug), plus untagged older ones that mention the project's distinctive words; other projects' goals not yet met today, each with its next ready issue; and, when the project's own goal has gone two work days without it moving, its latest comment or log entry. Outside a registered project it prints nothing, but it still refreshes the week's commit days that the status line counts.

**Status line** — The row `belay statusline` adds under Claude Code's status line when the cwd is in a registered project: the project's most recently updated `doing` issue (oldest on a tie; `+n` for more, and ⛔ if it has open blockers), or else its next ready issue, then ` │ ` and the goal strip: each counting Goal's progress (`JOB 6/10 applied · PORT 6 left ▲10d`, ✓ once met today). The strip shows outside registered projects too.

**Session** — One Claude Code transcript (`~/.claude/projects/<encoded cwd>/<id>.jsonl`). It belongs to the project its *launch* cwd maps to. Its commits are those committed under the project's paths between its first and last timestamps. Read only, never stored.

**Grill session** — A persisted `/grill` interview (`~/.claude/skills/grill/sessions/<slug>.md`). New sessions are tagged with the cwd's project (`project: <key>`, via `belay project which`); older ones are untagged. Accepting a grill's plan creates linked `todo` issues (`grill`, `plan`). The belay only reads these files.

**Dashboard** — The local web view that `belay serve` opens. The home page shows what's In flight and a timeline of recent work days, with the week's goals and the next ready issues in a side rail, `/projects` lists the projects, and each project gets an issue list grouped by status. Every page has a breadcrumb bar whose last crumb is the page title. It's where the user curates and triages issues: it edits every issue field except `project`, `grill` and `plan`, edits projects' name, group, status, focus, goal, kinds and sidebar order (drag, or a project move), and can delete issues. Each project page has an Issues and a Logs tab, each log entry has its own page that edits its text, day, kind, count, minutes and issue and can delete it, and any page can add a log entry (`L`). Its data operations are a subset of the CLI's, so registering projects stays CLI-only.
