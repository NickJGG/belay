# Formats

The JSON shapes that pass between the orchestrator, the reviewers, the verifiers and the scripts. Every script reads JSON on stdin (or flags) and writes one JSON object on stdout; it exits 2 on malformed input.

## Packet

`plan.mjs --out <packet>` creates a folder outside the reviewed repo. Agents read from it and write to it, so the orchestrator never holds a diff or a list of findings.

| Path | Written by | Holds |
|---|---|---|
| `plan.json` | plan | Full plan: mode, tier, seed, preview, spawns, skipped reviewers, excluded and mechanical files |
| `context.md` | orchestrator | `<intent>`, `<checks>`, `<review_instructions>`, `<folder_rules>` |
| `spawns/<id>.md` | plan | One reviewer's prompt: mode, pass, budget, assigned files, parts |
| `parts/<id>.<k>.diff` | plan | Its slice of the code, rendered with source line numbers, up to about 60 KB each |
| `hunks/<file>.diff` | plan | One file, rendered, for verifiers (`/` in the path becomes `__`) |
| `mechanical.md` | plan | Moves and import rewrites collapsed out of the diffs |
| `returns/<id>.json` | reviewers | `{findings, reviewed, skipped}` |
| `returns/checks.json`, `returns/secrets.json` | orchestrator, plan | Bare arrays of VERIFIED findings; these skip verification |
| `verify/<id>.json` | collect | One verifier's input: `{mode, groups}` |
| `verdicts/<id>.json` | verifiers | The verdict array |
| `coverage.json`, `merged.json` | collect | What the report reads |

A spawn id is `<reviewer>.p<pass>.c<chunk>`. The `quality` reviewer covers areas 01, 03, 04 and 05 in one agent; `--quality split` runs them separately.

## Saved review

`save.mjs` keeps every review in Belay's data dir (`$BELAY_DATA`, else `~/Belay`) at `reviews/<id>/`, for the site and `belay review`. Nothing there is in the data dir's git history, and it's deleted only on request (`belay review delete`). The packet stays in the scratchpad. A review never reads a saved one to judge code.

The id is `review-<yyyymmdd>-<hhmm>-<target slug>`, at most 64 characters, with `-2`, `-3`… on a clash.

| Path | Written by | Holds |
|---|---|---|
| `review.json` | save `init`, `progress`, `finish`, `stop` | The review and its stage progress |
| `checking.json` | save `progress` | While running: every finding sent to a verifier, with its verdict once it returns |
| `findings.json` | save `finish` | Every finding, numbered in report order |
| `hunks/<n>.json` | save `finish` | The diff hunk around finding `n`'s line |
| `coverage.json` | save `finish` | What the Scope section lists |
| `decisions.json` | `belay review decide`, `track`, `outcome` | Fix, Skip or Track per finding, and how fixes went |

Secret files are saved by name only: no hunk, no contents.

```json
// review.json
{
  "id": "review-20261104-1530-last-commit", "project": "BEL or null", "root": "C:/repo", "target": "last commit",
  "ref": "abc1234 or null", "mode": "diff | snapshot", "tier": "small | medium | large", "seed": 123, "preview": {"reviewers": 8, "files": 12},
  "started": "ISO time", "finished": "ISO time or null", "status": "running | done | stopped",
  "partial": "what did not complete, or null", "campaign": {"unit": "4 | cross-module | rollup", "of": 12},
  "stages": [{"name": "plan | checks | reviewers | verifiers | report", "status": "todo | doing | done", "started": null, "finished": null, "done": 5, "of": 8}]
}
// findings.json: an array of
{
  "n": 3, "section": "critical | important | unverified | debt | suggested | question | plausible | already | refuted",
  "must_fix": true, "severity": "IMPORTANT", "kind": "missing-null-check", "key": "<root_cause_key>",
  "title": "load() throws when user.profile is missing", "file": "src/users/service.ts", "line": 42, "sites": ["src/users/service.ts:42"],
  "impact": "…", "fix": "…", "trigger": "…", "evidence": "…", "rule": null, "confidence": "HIGH", "claim_class": "static",
  "pre_existing": "no", "needs_observation": null, "found_by": ["02-bugs-security"], "passes": [1],
  "verdict": "confirmed", "reason": "the verifier's reason"
}
// hunks/<n>.json: the hunk holding the line, clipped to 20 lines each side
{"file": "src/users/service.ts", "line": 42, "context": "function load", "lines": [{"kind": "+ | - | space", "line": 42, "text": "…"}]}
// decisions.json: by finding number
{"3": {"decision": "fix | skip | track", "issue": "BEL-140", "outcome": "applied | manual", "note": "why manual", "at": "ISO time", "by": "user | claude"}}
```

- **Section** places a finding in the report: refuted → Refuted; `pre_existing: noticed` → Already there; plausible → Plausible; unverified → Unverified; confirmed → its severity's section. `must_fix` is Critical or Important.
- **Needs you:** a must-fix finding with no decision, or a `fix` with no `outcome`. Everything else is done.
- A cleared decision keeps its `issue`, so a finding is never tracked twice.

## Tiers

| Tier | Diff: changed code/config lines | Snapshot: file lines | Reviewers |
|---|---|---|---|
| small | ≤ 400 | ≤ 1,500 | One pass each |
| medium | ≤ 5,000 | ≤ 15,000 | Bug reviewers (02, 06, 07, 09) add a second pass, on logic files only, with different chunk boundaries |
| large | above | above | As medium, and the plan asks first |

Which reviewers run depends on the files: 02 on code and config, 07 on non-test logic, 08 on code and tests, 06/09/10 when their file classes match, quality on everything.

## Finding (reviewer output)

A reviewer writes `{findings, reviewed, skipped}`, where `findings` holds entries of this shape.

```json
{
  "reviewer": "02-bugs-security",
  "pass": 1,
  "file": "src/users/service.ts",
  "line": 42,
  "severity": "CRITICAL | IMPORTANT | DEBT | SUGGESTED | QUESTION",
  "confidence": "VERIFIED | HIGH | MEDIUM",
  "claim_class": "static | runtime | data | rendering",
  "root_cause_key": "missing-null-check:src/users/service.ts:load",
  "title": "load() throws when the user has no profile",
  "evidence": "≤8 lines of code or tool output",
  "impact": "one sentence",
  "fix": "a concrete fix",
  "trigger": "the input or state that makes it fail",
  "rule": { "source": "CLAUDE.md:12", "quote": "exact rule text" },
  "pre_existing": "no | reached | noticed",
  "observation": "what the reviewer ran to observe a runtime/data/rendering claim, or null",
  "needs_observation": "the exact check that would settle it, when the claim is unobserved, else null"
}
```

- `confidence`: VERIFIED = a check or an observation the reviewer ran proves it; HIGH = the cited source proves it; MEDIUM = likely, not proven.
- `rule`: only for a finding that rests on a written rule (CLAUDE.md, AGENTS.md, REVIEW.md); null otherwise.
- `pre_existing`: `no` = introduced by the change; `reached` = older code the change calls into or depends on; `noticed` = older code passed on the way, unrelated to the change. In snapshot mode every finding is `no`.
- `root_cause_key`: `<category>:<file>:<symbol>`, lowercase kebab-case category from: `missing-null-check`, `unbounded-loop`, `n-plus-one`, `injection`, `race-condition`, `resource-leak`, `unhandled-error`, `silent-failure`, `dead-code`, `duplicated-logic`, `bad-naming`, `bad-typing`, `api-break`, `missing-test`, `stale-comment`, `rule-violation`, `a11y`, `i18n`, `perf`, `security`, `style`, else `other`.

## Verdict (verifier output)

A verifier writes a JSON array, one entry per group it was given, in the same order.

```json
{
  "root_cause_key": "missing-null-check:src/users/service.ts:load",
  "verdict": "confirmed | plausible | refuted | unverified",
  "severity": "the severity the evidence supports (may be lower than claimed, never higher)",
  "claim_class": "static | runtime | data | rendering",
  "reason": "1–2 sentences: the disproof found, or the checks that failed to disprove it",
  "reread_evidence": "the line(s) the verifier re-read that show the defect",
  "needs_observation": "required when verdict is unverified, else null",
  "pre_existing": "optional: no | reached | noticed, when the verifier finds the finding's own value wrong"
}
```

| Verdict | Meaning | Report section |
|---|---|---|
| `confirmed` | A quoted source line (or a check, or an observation) proves it | By severity |
| `plausible` | Real-looking, not proven, not disproved | Plausible |
| `refuted` | A specific disproof was found | Refuted, one line with the reason |
| `unverified` | A runtime/data/rendering claim with only static proof | Unverified, severity kept, with `needs_observation` |

## Scripts

All scripts are Node (`node scripts/<name>.mjs`), no dependencies.

| Script | Input | Output |
|---|---|---|
| `plan.mjs <target> --out <packet> [--paths a,b] [--exclude x,y] [--tier t] [--quality merged|split] [--passes n] [--effort e] [--extra a,b] [--skip a,b] [--seed n]` | flags; target is `--range a..b`, `--staged`, `--unstaged`, `--uncommitted`, `--diff-file f` or `--snapshot` | `{packet, mode, tier, ask, empty, seed, preview, spawns:[{id, model, effort, personas, prompt, returns}], skipped, excluded, secrets}` |
| `collect.mjs --packet d` | `returns/` | `{complete, missing, malformed, unaccounted, neverReviewed, skipped, findings, groups, proven, verifiers:[{id, mode, model, input, output, hunks}]}` |
| `collect.mjs --packet d --verdicts` | `verify/`, `verdicts/` | `{complete, missing, malformed, counts, merged, coverage}` |
| `collect.mjs --packet d --add f` | a bare array of findings in `f` | `{findings, verifiers}` |
| `campaign.mjs init|status|next|record|rollup` | see `references/campaign.md` | JSON per command |
| `save.mjs init --target t --root d [--ref r] [--project K] [--campaign u/of]` | — | `{id, dir}` |
| `save.mjs progress --id i --packet d [--checks doing|done]` | the packet | `{id, stages}` |
| `save.mjs finish --id i [--packet d] [--merged f] [--partial t]` | `merged.json` (or `f`), `coverage.json`, `plan.json`, `hunks/` | `{id, dir, url, site, mustFix:[{n, severity, title, file, line}], more, findings}` |
| `save.mjs stop --id i` | — | `{id, status}` |
| `discover.mjs [--repo <dir>]` | — | `{root, defaultBranch, workspaces:[{dir, manager, scripts:{typecheck, lint, test}}], languages, tools, ruleFiles:{review, claude:[…]}}` |
| `select-files.mjs` | `[{path, status, insertions, deletions, bytes}]` | `{reviewable:[…], excluded:[{path, reason}], secrets:[path], oversized:[path]}` |
| `select-agents.mjs [--tier t] [--quality q]` | output of `select-files.mjs` | `{agents:{<id>:{spawn, files, reason, model, passes, secondPassFiles, budget, chunks:[[file]]}}}` |
| `dedupe.mjs` | `[finding]` | `[{root_cause_key, findings:[finding], found_by:[reviewer], severity}]` |
| `modules.mjs [--repo <dir>] [--paths a,b]` | — | `{modules:[{name, dir, files, bytes}], excluded:[{path, reason}]}` |
| `deps.mjs --before <file> --after <file>` | two manifest texts | `{added:[…], removed:[…], majorBumps:[…], otherBumps:[…]}` |
| `tally.mjs` | the report text | `{critical, important, debt, suggested, question, unverified, plausible}` |
