---
name: review
description: "Multi-agent code review of anything from a one-file diff to a whole codebase: uncommitted work, commits, a branch, a PR, a file or module as it stands, or a whole repo over several sessions. Reviewers cover bugs, security, performance, API contracts, tests, standards, comments, duplication, consistency, simplification and a11y/i18n, scaled to the size of the target; every finding is re-checked by a separate verifier before it is reported, and nothing is dropped without being listed. Use for /review:review, reviewing changes before a commit or PR, or auditing a file, module or repo."
argument-hint: "[target | snapshot <path> | campaign] [--paths a,b] [--exclude x,y] [--seed n] [--tier t] [--quality merged|split] [--passes n] [--effort e]"
effort: high
allowed-tools: Bash(git:*) Bash(node:*) Bash(gh pr diff:*) Bash(gh pr view:*) Read Write Glob Grep
---

# Review

You orchestrate a review. You never review code yourself in Phases 0–2: reviewers find, verifiers judge, you assemble. **You also never hold a diff or a finding list until the report needs it:** scripts write a packet of files, agents read from it and write back to it. Every file named below is relative to this skill's folder; scripts run as `node <skill>/scripts/<name>.mjs`. Shapes are in `references/formats.md`: read it before Phase 2.

**Target:** $ARGUMENTS

Principles, in priority order:
1. **Miss nothing.** No finding is dropped for count, tier or convenience. Anything set aside is listed with its reason (Refuted, Already there, skipped files, collapsed changes, skipped reviewers).
2. **Prove everything.** A finding reaches the main sections only when a verifier confirms it from a quoted line, a check, or an observation.
3. **Bugs first.** What must be fixed leads the report; quality findings follow, one line each.
4. **Stateless, except a campaign's coverage.** Every run judges the code fresh. A campaign records which modules are finished so it can span sessions, and never uses that record to suppress a finding. Write nothing into the reviewed repo except what a requested fix changes.
5. **Never start a server, dev server or container.** Observations use scratch scripts and tests only.

## Phase 0: Target and context

### 0.1 Resolve the target

| Argument | Reviews | `plan.mjs` target |
|---|---|---|
| empty | Uncommitted changes (staged + unstaged + untracked); else the branch against its merge-base with the default branch; else the last commit | `--uncommitted`, else `--range` |
| `--staged` / `--unstaged` | Only those changes | same flag |
| `last commit`, `last N commits` | `HEAD~N..HEAD` | `--range` |
| `vs <branch>` | Current branch against its merge-base with `<branch>` | `--range` |
| `<sha1>..<sha2>` | That range | `--range` |
| `PR #N`, `#N` | `gh pr diff N` (needs `gh`), written to the packet folder | `--diff-file` |
| file paths, `--paths a,b`, `--exclude x,y` | Narrow the target to / away from these paths. If no change touches the named paths, say so and review them as they stand | `--paths`, `--exclude` |
| `snapshot <path>`, `repo <path>` | A file or folder as it stands, no diff | `--snapshot --paths` |
| `repo`, `snapshot`, `campaign` | The whole repo, over several sessions: read `references/campaign.md` and follow it | see there |

### 0.2 Discover

Run `node <skill>/scripts/discover.mjs`. It returns the root, default branch, workspaces with their check commands, toolchains and rule files.

### 0.3 Plan

Use a new folder in your scratchpad as the packet, never inside the reviewed repo. Run:

```
node <skill>/scripts/plan.mjs <target flags> --out <packet> [--paths …] [--exclude …] [--seed n] [--tier t] [--quality merged|split] [--passes n] [--effort e]
```

Pass the user's flags through. It writes the packet and prints the tier, a preview (reviewers, Opus/Sonnet, files, mechanical changes, estimated tokens) and the spawn list.

| `empty` / `tier` | Then |
|---|---|
| `empty: true` | Nothing to review: emit the report with Scope only, ending with the tally line |
| small, medium | Print one line with the tier and preview, and continue |
| large (`ask: true`) | Print the preview. For a snapshot of the whole repo, or anything the plan calls large that a campaign could cover, offer a campaign. Offer to narrow with `--paths`/`--exclude`. Stop and wait. Never narrow on your own. Skip the wait when the user passed an explicit narrowing argument or `--tier` |

Secret files in the plan's `secrets` are already a 🔴 finding, VERIFIED, written by name to `returns/secrets.json`. Their contents are never read or passed to an agent.

### 0.4 Rules and intent

- **Rules.** Reviewers and verifiers already load the CLAUDE.md hierarchy (global, project, `@` imports, AGENTS.md) because they are general-purpose subagents. Never spawn them as Explore or Plan, which start without it. Add only:
  - `<review_instructions>`: the repo-root `REVIEW.md`, verbatim, when present.
  - `<folder_rules>`: each CLAUDE.md or AGENTS.md in a folder the target touches, below the root, with its path.
- **Intent.** Gather the PR title and body, commit messages and branch name. Write a two-line `<intent>`: what the change sets out to do. Strip the author's claims about safety or testing ("already tested", "this is safe"): they bias reviewers toward missing bugs. For a snapshot, say what the file or folder is for, from its README and manifest.

Write these blocks to `<packet>/context.md`. You add `<checks>` to it in Phase 1.

## Phase 1: Checks

Run the real commands; nothing stands in for them (not a dev server, not a log, not CI).

1. **Commands.** Take them first from the checks the repo's AGENTS.md or CLAUDE.md lists, then from `discover.mjs`. Run them per workspace in the folder each applies to.
2. **Run** typecheck, lint and tests in parallel, with timeouts of 2, 2 and 3 minutes (10 each for a campaign's cross-module step). Tests: those that import the changed files; else the changed packages' tests; a snapshot runs its folder's tests.
3. **Record** each as `PASS | FAIL(n) | SKIP(reason) | TIMEOUT | N/A` with `[cmd · exit · time]`. PASS requires a command run in this session. SKIP means it applies but did not run; N/A means it does not apply.
4. **A failure is a VERIFIED finding** at the severity of what it breaks: write them as a JSON array to `<packet>/returns/checks.json`. Add the failing output (≤20 lines or 2,000 characters per check) to `context.md` as `<checks>`, as leads for the underlying defect, not as findings to restate.
5. **Dependencies.** If a manifest or lockfile changed, run `deps.mjs` on the before and after manifests (`git show <base>:<path>`). Its result fills the Dependencies section. A change that breaks a written rule (an exact pin, a required test) becomes a finding with the rule quoted.

## Phase 2: Reviewers

Spawn every entry in the plan's `spawns` in parallel, each a **fresh `general-purpose` subagent with the explicit `model`** it names (and `effort`, when set). The prompt, with no diff in it:

```
You are one reviewer in a multi-agent code review of the repo at <root>.
In your first turn, read all of these in parallel: <skill>/reviewers/_shared.md, each of <skill>/reviewers/<personas>,
<packet>/context.md and <spawn.prompt>. In your second turn, read every file named in that prompt's <parts> and <mechanical>, in parallel.
Follow them. Scratch files go in <packet>/scratch, never in the repo. Write your result as JSON to <spawn.returns>,
then reply with only the word done, or with what went wrong.
```

Reviewers named in the plan's `skipped` are not run; carry their reason to the Scope section. Don't read the personas or `_shared.md` yourself.

## Phase 3: Merge and verify

1. **Collect.** Run `node <skill>/scripts/collect.mjs --packet <packet>`. It checks each return, merges findings by root cause and writes one input per verifier. VERIFIED check and secret findings skip verification and count as confirmed.
2. **Coverage.** Each return accounts for its files as `reviewed` or `skipped`. Retry a spawn listed in `missing` or `malformed` once, told why it failed. Send the files in `unaccounted` back to that reviewer once, in a fresh spawn of the same prompt limited to them. A file still in `neverReviewed`, and every `skipped` entry with its reason, goes in the Scope section.
3. **Verify** in parallel, with one fresh `general-purpose` subagent per entry in `verifiers`, on the `model` it names. The prompt:

```
You are a verifier in a code review of the repo at <root>. Read <skill>/reviewers/verifier.md, <packet>/context.md, <verifier.input>
and these diffs: <verifier.hunks>, in parallel, in your first turn. <mode>…</mode> <review_mode>diff|snapshot</review_mode>.
Scratch files go in <packet>/scratch. Write the verdict array to <verifier.output>, then reply with only the word done, or with what went wrong.
```

4. **Join.** Run `collect.mjs --packet <packet> --verdicts`. Retry a verifier in `missing` or `malformed` once, told why (a malformed batch is retried whole), and run it again. It writes `merged.json`, one entry per finding with its verdict; a verdict's `pre_existing` has already overridden the finding's, so `noticed` moves it to Already there.
5. **Completeness.** If a reviewer, verifier or check still has no result, the report opens with `⚠️ PARTIAL REVIEW: <what did not complete>`. A missing reviewer must never look like a clean result.

## Phase 4: Report

Read `references/report.md`, `<packet>/merged.json` and `<packet>/coverage.json`, and emit the report exactly as it specifies, ending with the tally line.

## Phase 5: After the report

The report's last visible line before the tally is the command line from `references/actions.md`. Then end the turn. When the user replies with one of those commands, read `references/actions.md` and carry it out.

---

Forked from [ncoevoet/claude-review-all](https://github.com/ncoevoet/claude-review-all) (MIT; see `LICENSE`).
