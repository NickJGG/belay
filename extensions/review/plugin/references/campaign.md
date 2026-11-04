# Campaign: a whole codebase over several sessions

One session reviews one unit, so each stays in the high-quality part of the context window and a stopped campaign loses nothing. The ledger is plain files in `<data>/reviews/campaigns/<repo>-<hash>/` (Belay's data dir: `$BELAY_DATA`, else `~/Belay`), outside the repo. It records coverage and findings, and is never used to suppress a finding later.

Keep each session simple: reviewers pointed at one component, one pass, with confirmed bugs hunted across the repo afterwards. Heavier pipelines tend to add triage work rather than bugs.

## Start or resume

Run `campaign.mjs status`. If it exits 3 there is no campaign yet.

**No campaign:**

1. Run `campaign.mjs init [--paths …] [--exclude …]`. It splits the repo into units of up to about 400 KB, riskiest first (churn, fix commits, security-class files), and lists the excluded files. Secret files in `excluded` become 🔴 findings by name in the first unit's report.
2. Print the units, their order and an estimate: `plan.mjs --snapshot --paths <unit files> --passes 1 --out <scratch>` for the largest, times the unit count. Wait for the go-ahead. The ask always happens here.
3. Spawn one `general-purpose` agent, `model: sonnet`, to write `<campaign>/map.md`, under 150 lines: what each module does, entry points, trust boundaries (where untrusted input arrives), and the invariants the code relies on. It reads manifests, READMEs and entry files, and doesn't review anything.

**Campaign exists:** report progress. If `stale` names finished units, their files changed since the campaign began; say so, and offer to reset them by hand-editing their status in `campaign.json` to `pending`. Never reset on your own.

## One unit per session

1. Run `campaign.mjs next`. For `kind: "unit"`, write its `paths` to a comma-joined list and follow SKILL.md from Phase 0.3 with `plan.mjs --snapshot --paths <paths> --passes 1 --out <packet>`, skipping the large-tier wait, since the campaign was approved.
2. Add `<campaign>/map.md` to `context.md` as `<system_map>`. Phase 1 runs the unit's tests.
3. After Phase 3, **hunt variants**: for each confirmed 🔴/🟠 bug, spawn one `general-purpose` agent, `model: sonnet`, to Grep the whole repo for the same mistake and write any further sites as a bare JSON array of findings to `<packet>/variants-<n>.json`, with `reviewer: "variants"`. Run `collect.mjs --packet <packet> --add <file>`, spawn the verifiers it lists as in SKILL.md Phase 3, then run `collect.mjs --packet <packet> --verdicts` again.
4. Run `campaign.mjs record --unit "<name>" --merged <packet>/merged.json`.
5. Emit the report for this unit, then add one line: `Campaign: 3 of 12 units done. Next: <name>. Start a new session and run /review:review campaign.` End the turn.

If context is running short before a step finishes, stop before `record`. An unrecorded unit runs again; a recorded one with partial findings would not.

## Last step: across modules

`campaign.mjs next` returns `kind: "cross-module"` once every unit is done.

1. Run the full checks, with 10-minute timeouts.
2. Spawn `09-api-contract` on `model: opus` and `04-consistency-history` on `model: sonnet`, with `map.md`, `rollup.json` (from `campaign.mjs rollup`) and each unit's exported entry points and manifests. Their bugs live where modules meet. They write findings to the packet as usual, then Phases 3 and 4 apply.
3. Run `campaign.mjs record --unit "(cross-module)" --merged <packet>/merged.json`.

## Final report

Run `campaign.mjs rollup` again and write the report in `references/report.md`'s layout, across every unit, from `rollup.json`. A root cause found in several units is one finding with all its sites. Scope lists every unit, the excluded files, and any unit still pending under `⚠️ PARTIAL REVIEW`. Nothing is pre-existing in a campaign, and there is no Already there section.

## Differences from a diff review

- **Nothing is pre-existing.** Every finding is `pre_existing: "no"`.
- **Conventions.** A pattern in 5+ files elsewhere in the repo excuses quality findings only. A bug repeated across the repo is a finding at every site (one root cause, all sites listed).
- **Intent** is a two-line description of what the unit is for.
