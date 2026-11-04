# Report

Read by the person who made the change, in a terminal. They should learn in one line whether anything must be fixed, then act on each must-fix finding without re-investigating it. Emit the report as text; no tool calls in the middle of it.

## Rules

- **Number findings by their `n`** in `findings.json`: `**#7**`. `save.mjs finish` numbered them in this layout's order, Refuted included, and put each in its `section`; the site, `belay review` and the commands in `actions.md` use the same numbers. Never renumber.
- **One root cause = one finding.** Extra sites go on the same finding: `also at a.ts:12, b.ts:40`.
- **Titles name the failure**, quoting the real identifier, in sentence case: `load() throws when user.profile is missing`, not `Potential issue`. A title starting with code keeps the code as written.
- **`findings.json` holds every finding with its verdict**: `sites` lists every location, `found_by` and `passes` the reviewers and passes.
- **Found by:** when a finding came from 2+ reviewers or both passes, add `found by 02-bugs-security (2 passes), 07-performance`. Information only.
- **Rule-based findings quote the rule** with its source: `CLAUDE.md:14: "Only comment code that is genuinely unintuitive"`.
- **Pre-existing `reached` findings** sit in the main sections, tagged `(older code your change now calls)`.
- **Empty sections are omitted**, except Critical and Important, which say `None.` A clean review is a valid outcome; never pad it.

## Full form (🔴, 🟠, Unverified)

```
**#3** load() throws when user.profile is missing `[🟠 IMPORTANT · HIGH]` — src/users/service.ts:42
Impact: any user without a profile gets a 500 on /account.
Trigger: a user created before profiles existed (profile is null).
Suggested fix: guard with `user.profile?.name ?? user.name`.
```ts
42  return `Hello ${user.profile.name}`
```
```

Evidence is the load-bearing lines only, at most 8. The confidence tag is honest: a 🔴 at MEDIUM is never printed as proven (it would be in Plausible or Unverified).

Unverified findings add `To settle: <needs_observation>` and keep the severity the reviewer gave.

## One-line form (everything else)

`**#12** src/lib/date.ts:30 — duplicates formatDay() in src/lib/format.ts:8 (03-dry-smells)`

## Layout

```
# Review: <target>

<⚠️ PARTIAL REVIEW: … — only when something did not complete>

> **Verdict:** 3 must-fix: 1 🔴, 2 🟠 · 9 more below
  (or) > **Verdict:** ✅ Nothing must be fixed · 9 more below

**Intent:** <two lines from Phase 0.3>

## Checks
| Check | Result | Command · exit · time |
(typecheck, lint, tests per workspace; dependency summary line if any)

## 🔴 Critical
## 🟠 Important
## 🔬 Unverified: needs an observation
## Quality
### 🟡 Debt
### 🔵 Suggested
### ⚪ Questions
(one line each; within a tier, grouped by reviewer)
## Plausible (not proven, not disproved)
## Already there (older problems, not from this change)
## Dependencies
## Refuted (checked and set aside)
`**#20** src/api.ts:40 — "unvalidated body" — refuted: validateBody() runs first (src/api.ts:31)`
## Scope
Tier: <tier> · Reviewed N files (M modules) · Collapsed as mechanical: K files, checked by summary · Skipped: <file — reason, including every entry in coverage.json> · Not reviewed by anyone: <file> · Reviewers not run: <id — reason> · Seed: <n>

fix all · fix must · fix #1 #3 · triage · track #N · ask #N · investigate #N · tests #N · re-run

<!-- review-tally: {"critical":C,"important":I,"debt":D,"suggested":S,"question":Q,"unverified":U,"plausible":P} -->
```

- **Verdict counts** only confirmed 🔴/🟠 (and VERIFIED check and secret findings) as must-fix. Unverified, Plausible and Already there are never must-fix.
- **The tally line is always last**, on every run, including an all-zero one. Nothing follows it.

## Summary form

Only when SKILL.md Phase 4 says so: the session is attached to the Belay site and it answered. The page shows the rest, so the terminal gets:

```
# Review: <target>

<⚠️ PARTIAL REVIEW: … — only when something did not complete>

> **Verdict:** 3 must-fix: 1 🔴, 2 🟠 · 9 more on the page

**#1** load() throws when user.profile is missing `[🔴 CRITICAL]` — src/users/service.ts:42
(one line per must-fix finding, in number order)

Review: <finish's url>

fix all · fix must · fix #1 #3 · triage · track #N · ask #N · investigate #N · tests #N · re-run

<!-- review-tally: … as in the full report -->
```

Typed commands work exactly as after the full report.
