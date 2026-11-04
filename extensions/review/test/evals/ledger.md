# Change ledger

One row per shipped or reverted change to `/review:review` (`/change-review` before it became an extension). The `Observed` column quotes the evidence as stated (eval case ids with k/N, both arms, the `CONFIG` line); nothing is inferred.

Verdict vocabulary (borrowed from the edit-row record of google-research/harness2):

- `helped` / `hurt`: a stated eval contrast supports the direction.
- `no observed effect`: a stated eval shows the baseline arm already matches the treatment arm.
- `confounded`: a single run, or several simultaneous component changes, stand behind a difference. Prefer this over `helped`/`hurt` in those cases.
- `unmeasured`: no eval evidence is stated.

A lesson that rests only on `confounded` rows is a guess. A case only counts as evidence once the baseline arm has been shown to fail it (see `README.md`).

| Change | Component | What changed | Observed | Verdict |
|---|---|---|---|---|
| 2026-10-31 | whole pipeline | First end-to-end runs of the packet flow | model=opus, N=1 each, no baseline arm: 01 PASS, 02 PASS, 05 PASS; cost_usd 1.72, 1.27, 2.31. Case 01 reproduced the TypeError but filed it under Unverified with a clean verdict line, and split one mechanism across two findings | unmeasured |
| 2026-10-31 | scripts/plan.mjs, collect.mjs, agents/_shared.md | Packet on disk: reviewers read parts and write returns; the orchestrator holds no diff; source line numbers in every part | Planning only: the 195-file range of 2026-10-30 plans 21 reviewers against 50. No review run yet | unmeasured |
| 2026-10-31 | lib/diff.mjs `isMechanical` | Exact moves and specifier-only import edits collapse into mechanical.md | Same range: 126 files collapsed, against 123 trimmed by hand on 2026-10-30. Recall effect not run | unmeasured |
| 2026-10-31 | lib/chunk.mjs | Chunks by rendered bytes with related files together; the 40-file cap is gone; the second pass gets its own boundaries, on logic files only | No eval | unmeasured |
| 2026-10-31 | lib/select.mjs tiers | Small tier: one pass, about 4 reviewers on a code diff, against 9 before | Spawn counts only. Whether small diffs lose recall without the second pass is an open A/B | unmeasured |
| 2026-10-31 | agents/quality.md | Areas 01, 03, 04, 05 in one Sonnet agent by default; `--quality split` restores them | A/B not run. The default rests on cost alone until it is | unmeasured |
| 2026-10-31 | agents/verifier.md | Single-mode verifiers try a repro for static claims with a trigger | No eval | unmeasured |
| 2026-10-31 | references/campaign.md, scripts/campaign.mjs | Whole codebase as resumable sessions, riskiest first, one pass per unit, plus a variant hunt | Mapping only: Belay splits into 12 units. No campaign run yet | unmeasured |
| 2026-10-31 | references/actions.md | `track #N` removed, so the skill doesn't depend on Belay | No eval needed: a removal | unmeasured |

## From /review-all

The ledger of the skill this one was forked from, kept as history. SHAs refer to the `ncoevoet/claude-review-all` repository, not to this skill.

| SHA | Component | Change | Observed | Verdict |
|---|---|---|---|---|
| 08f90ba | scripts/eval-scorecard.py, run-evals-headless.sh | v0.7.0 A: suite recall/precision/F1/SNR scorecard, SCORE lines, config hook | "each eval-validated for non-regression"; no case ids or k/N stated | unmeasured |
| 08f90ba | verifierVotes (verifier) | v0.7.0 B: opt-in majority-vote verifier, default 1 | same non-regression claim; no case ids or k/N | unmeasured |
| 08f90ba | SKILL.md Phase 2 | v0.7.0 D: previously-dismissed digest passed to finding agents | same non-regression claim; no case ids or k/N | unmeasured |
| 08f90ba | beyond-the-diff blast-radius prototype | removed before the v0.7.0 commit | "prototyped and evaluated but removed before this commit: the skill already performs cross-file caller analysis — the control arm caught a designed cross-file break and executed the code to confirm the runtime error — so the feature was redundant" | no observed effect |
| 36c88b0 | agents/_shared.md, verifier, Phase 1 gates | v0.7.1: claim classes, `unverified` verdict (v5 to v6), gate provenance | none stated (tests/check-claim-class.sh added as a doc gate) | unmeasured |
| f78c517 | REVIEW.md support | v0.8.0: repo-root REVIEW.md injected into agents and verifier | case 90, per 206787c: baseline FAIL (1/3) vs treatment PASS (3/3); contrast was v0.7.1 baseline vs whole v0.8.0 tree (REVIEW.md, diff ordering, gate_results, staleness rule shipped together); case 90 targets REVIEW.md | confounded |
| f78c517 | scripts/agent-order.py | v0.8.0: per-agent diff ordering | only case 02 exercises it; 02 returned PASS (2/3) then FAIL (1/3) on identical baseline code (206787c) | unmeasured |
| f78c517 | gate_results block, dedupe.py corroboration | v0.8.0: failing-gate output to agents; corroborating_agents | case 92 passes on both arms (206787c) | no observed effect |
| 206787c | consistency persona | v0.8.1: staleness rule removed | case 91, two fixture designs, N=3, both arms: v0.7.1 baseline PASS 3/3, same as treatment | no observed effect |
| 2589d55 | evals cases 90, 91, 92 | rewritten so each case needs its feature; 92 added (gates genuinely fail) | "A/B of the rewritten cases has not run yet" | unmeasured |
| 642f017 | per-axis checkpointing, model tiers | v0.9.0: HEAD+diff-keyed resume; 4 opus / 6 sonnet tiers | none stated (tag message only) | unmeasured |
| eb01031 | phase-4-menu.md, config-keys.md | v0.9.1: pin every Phase 4 spawn, drop verifierModel "inherit" | refusal by the model-pin hook stated as observed; no eval | unmeasured |
| fc19e9b | SKILL.md, phase-3-report.md, runner | v0.9.2: severity tally named in required sections; `SCORE,<id>,MISSING` | two captured headless reports lacked the tally comment; no A/B | unmeasured |
| 3205fe9 | agents/_shared.md | exploration budget (tool order, ~15 search calls) | 78 review subagents: 1813 Bash / 238 Read / 10 CodeGraph / 1 Grep; "no A/B" | unmeasured |
| 4f15f63 | Phase 2.5 spawn site | verifier model stated where the orchestrator reads it; persona loaded once | 19 verifiers: 12 sonnet, 7 opus, 0 haiku; no A/B | unmeasured |
| be5146d | agents/_shared.md, Phase 2.5 | v0.9.3: packages 3205fe9 + 4f15f63 | "No eval A/B this cycle"; pass-rate signal below noise floor | unmeasured |
| 86b2bc4 | run-evals-headless.sh | REVIEW_ALL_EVAL_MODEL, CONFIG line, exit 3 on empty filter | harness tooling; haiku-vs-sonnet verifier A/B "not included" | unmeasured |
| bfebcfb | select-agents.py, select-files.py, rules/ | pre-dispatch agent and file selection; language rule packs | deterministic counts only (630 vs 910 spawns over 91 fixtures); no graded review quality | unmeasured |
| a17b670 | same as bfebcfb | v0.10.0 release of bfebcfb | "No eval A/B backs this release"; baseline arm running, treatment not | unmeasured |
| 33a8bf3 | state.json `rejected`, code-hash.py | machine dismissals remembered across runs | payoff is spend avoided; "unmeasured and unmeasurable by this harness"; case 98 non-discriminating by construction | unmeasured |
| 33a8bf3 | reverted security evidence-discipline rules (cases 93-98) | convention carve-out, 3 severity-inflation guards, boundary+trace schema; reverted pre-release | baseline at opus: 93 PASS (2/3), 94 PASS (1/1), 95-98 PASS (3/3) each | no observed effect |
| f328056 | v0.10.1 release | packages 33a8bf3; 93 left open | N=3 cannot separate 2/3 from 3/3; about N=10 per arm needed | unmeasured |
| f4c52fb | scripts/severity-tally.py | recover per-tier counts when the tally comment is dropped | 7 of 9 headless runs carried the comment; a harness repair, no review-quality claim | unmeasured |
| f27c30e | agents/_shared.md | attempt the observation before the unverified cap | case 01 over six runs: 0, 0, 1, 2, 5 findings; N=10 A/B stopped after three baseline runs (2, 0, 0) | unmeasured |
| 9689f52 | v0.10.2 release | packages f4c52fb + f27c30e | "Neither fix has a demonstrated recall or precision effect" | unmeasured |
| fe3c4ab | SKILL.md layout, references/troubleshooting.md | v0.10.3: hard rules hoisted, examples moved; text unchanged | "No eval was run"; effect of placement unmeasured | unmeasured |
| 1b817f2 | phase-4-menu.md, SKILL.md Phase 4, check-phase4-menu.sh | v0.11.0: one-step menu with finding-ID ranges; Mode A sub-menu, Mode C menu and triage Round 3 removed, their actions typed in `Other` | transcript audit, 51 sessions / 82 runs: primary menu ~30 answers (Fix by scope 20, Triage 3, Skip 1, More actions 0); broadest scope 9/9; improvised one-step menus ~10, Recommended picked ~90%; no A/B | unmeasured |
