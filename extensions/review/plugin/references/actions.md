# After the report

The report ends with this command line, then the turn ends:

```
fix all · fix must · fix #1 #3 · triage · track #N · ask #N · investigate #N · tests #N · re-run
```

The user replies in plain text. Accept close variants ("fix 1, 3 and 7", "fix the criticals"). Several commands in one reply run in this order: fixes → tests → ask/investigate → re-run. After each command, print what happened and the command line again, then end the turn.

## Commands

| Command | Does |
|---|---|
| `fix all` | Fix every confirmed 🔴, 🟠, 🟡 and 🔵 finding, and every VERIFIED check or secret finding |
| `fix must` | Fix confirmed 🔴 and 🟠 only |
| `fix #1 #3` | Fix exactly these, from any section (naming a Plausible, Unverified or Already there finding is an explicit choice to fix it) |
| `triage` | Walk the confirmed findings in report order. For each, print it in full form and ask `fix · skip · track · stop`; wait for the reply; act (a skip runs `belay review decide <id> <n> skip`); move on. Each finding is visited once |
| `track #N` | Run `belay review track <id> <N>`: it adds a Belay idea with the finding's title, file:line and a link to the review, and records it. Print the issue id it added. If it says the review has no project, ask which project and pass `--project <key>` |
| `ask #N <question>` | Answer a question about one finding (default: "why does this happen and how would you fix it?"). Spawn one `general-purpose` agent, `model: sonnet`, read-only, with the finding, the full enclosing function re-read now, the diff hunk and nearby tests. Print its answer |
| `investigate #N` | As `ask`, on `model: opus`: callers and callees, root cause, 2–3 fix strategies with their trade-offs |
| `tests #N` | Write a test that fails on the bug and passes after the fix. Follow the repo's test layout and framework, read 1–2 sibling tests for style, show the path and content, and write it only after the user confirms |
| `re-run` | Run the whole review again on the current tree, with a fresh seed |

## Applying a fix

For each finding in scope, in file-then-line order:

1. Read the file before editing it, every time; earlier edits invalidate the read.
2. Apply the finding's fix with Edit.
3. A fix that needs a new file, several files or a design change is not attempted: record `manual follow-up` with what it needs.
4. If the code no longer matches the evidence, record `manual follow-up: code changed since the review`. Never guess a replacement string.

Then re-run the Phase 1 checks and print:

```
## Fix results
Applied 4 · Manual follow-up 1 · Checks: typecheck ✅ lint ✅ tests ✅
| # | Sev | Outcome | Why |
```

Every finding in scope appears in the table.

**Record the outcomes** on the saved review, so the page and `belay review` show them: `belay review outcome <id> <n…> applied` for those applied, and `belay review outcome <id> <n> manual --note "<why>"` for each manual follow-up.

**Delta review.** When at least one fix applied and every check that passed before still passes, review only what the fixes changed (Phases 0.2–4 on that diff, saved as its own review with `--target "fixes from <id>"`, fresh seed, no second pass unless its size earns one) and append the result under `## Post-fix review`. If a check now fails, show its output and suggest `git diff` or `git checkout -- <file>`; never roll back yourself.

## Resume

`/review:review resume <id>` runs in a fresh session, usually opened from the site after decisions were queued there with no session attached. It needs only the saved review and the current code; nothing is re-reviewed.

1. Run `belay review show <id> --json`: the review (its `root` is the repo to work in), its numbered `findings` and its `decisions`. Work in `root`.
2. The queued fixes are the findings whose decision is `fix` with no `outcome`. If there are none, say so, print the command line and end the turn.
3. Apply them as in Applying a fix, with the finding's `file`, `line`, `evidence` and `fix` from the saved review. Step 4's evidence check is what catches code that moved since the review: it becomes manual follow-up, never a guess.
4. Record the outcomes, run the checks, print Fix results and run the delta review, all as above.
5. Print the command line. Typed commands keep the saved review's numbers.

## Guardrails

- Never fix a ⚪ QUESTION finding: it needs a person's decision.
- Never touch a file the finding does not name.
- Never commit, push or open a PR.
- Never start a server, dev server or container.
- `ask` and `investigate` agents never edit code.
