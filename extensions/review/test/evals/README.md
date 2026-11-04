# Evals: `/review:review`

These are tests for the skill itself. Each case is a tiny fixture repo with a known bug (or with code that is known to be correct), a rubric saying what a good report contains, and a runner that reviews the fixture with `/review:review` and asks a second model to grade the report against the rubric. They never run during a review: run them when you change the skill, to see what the change did to recall and precision.

The suite is ported from `/review-all` (MIT), whose cases follow Anthropic's [Define success criteria and build evaluations](https://platform.claude.com/docs/en/test-and-evaluate/develop-tests) guidance: measurable criteria, automated grading, edge cases, volume over per-case polish.

## Cost

**Each case run is a full review plus a judge call.** Most synthetic fixtures are small-tier: about four reviewers, plus a verifier per finding and the repo's checks. The whole synthetic suite at `REVIEW_EVAL_RUNS=1` is 95 reviews; at `RUNS=3` it is 285. Start with a filter.

## Running

From this folder (`extensions/review/test/evals`), with `claude` on PATH and the `review` extension installed so `/review:review` resolves from any folder:

```sh
node validate.mjs                 # free: schema-check every case
node run.mjs 01                   # cases whose id contains "01"
REVIEW_EVAL_RUNS=3 REVIEW_EVAL_MODEL=opus node run.mjs 9 | tee results.txt
node scorecard.mjs results.txt    # recall / precision / F1 / SNR

REVIEW_EVAL_DIR=~/Belay/reviews/evals-real node run.mjs   # the real-bug cases
```

## Which set to trust

- **The real cases (`<data>/reviews/evals-real/`, outside the repo) are the ones to tune against.** Each case is a commit from your own history that introduced a bug a later commit fixed, reviewed as if it were your uncommitted change. Found with `mine.mjs`, with the rubric written from the fix by a reader, not by a script. Keep these out of persona edits: never add a checklist item because a real case missed it, or the set stops predicting anything. The cases name local repos, so they live in the data dir and run on this machine only.
- **The synthetic cases are regression guards.** Many bullets in `plugin/reviewers/02-bugs-security.md` mirror them one for one, so passing them shows the prompt still contains the bullet, not that the skill finds bugs it wasn't told about.

## A/B arms

Pass an arm with `REVIEW_EVAL_ARGS`, and keep the model and effort pinned across arms. Every run prints a `USAGE` line, so compare cost next to recall.

| Question | Arm A | Arm B |
|---|---|---|
| Does merging the quality reviewers lose findings? | `--quality merged` | `--quality split` |
| Second pass or more effort? | `--tier medium` | `--passes 1 --effort xhigh` |
| Does a small diff need a second pass? | `--tier small` | `--tier medium` |

The old skill is saved in `~/.claude/change-review-baseline/`. To run it as the baseline arm, swap it into `extensions/review/plugin/` for that run.

Each run materializes the fixture into a fresh temp git repo (`node materialize.mjs CASE.json [DEST]` does just that step): the `before` files are committed, the `after` files written and staged, so the review sees an uncommitted change. The review runs there with `claude -p --dangerously-skip-permissions` (the repo is throwaway). The judge gets the rubric, the report and a short description of the report's sections (see `JUDGE_GUIDE` in `run.mjs`), and ends with PASS or FAIL. A case passes when more than half its graded runs pass.

| Env | Effect |
|---|---|
| `REVIEW_EVAL_RUNS` | Runs per case (default 1). More smooths LLM noise. |
| `REVIEW_EVAL_MODEL` | `--model` for both the review and the judge. Unset, each call runs at the CLI's default, which no A/B can attribute: set it on every run you will compare. |
| `REVIEW_EVAL_EFFORT` | `--effort` for the review. Leave unset to measure the real operating point; low effort suppresses recall. |
| `REVIEW_EVAL_ARGS` | Arguments for the skill, for an A/B arm. |
| `REVIEW_EVAL_SEED` | Passes `--seed <n>` to the skill so every run replays the same file order. Unset, each run gets a fresh seed, read back from the report's Scope line. |
| `REVIEW_EVAL_TIMEOUT` | Seconds per `claude` call (default 900). |
| `REVIEW_EVAL_KEEP_DIR` | Saves `<dir>/<id>/CONFIG.txt`, `run<r>.report.md` and `run<r>.judge.txt`. Refuses (exit 3, before any call) when a selected case's folder already has files. |
| `REVIEW_EVAL_CLAUDE` | The `claude` command (a `.mjs` path runs under node). The tests point it at a fake. |
| `REVIEW_EVAL_DIR` | The cases folder (default: this folder). |

Output lines:

- `CONFIG,model=…,effort=…,runs=…,timeout=…,seed=…,args=…`: first, so a number never travels without the settings it was measured at.
- `SCORE,<id>,critical,important,debt,suggested,question,unverified,plausible,<source>`: one per graded run, from the report's `review-tally` line (`source=comment`). When the report dropped that line the counts are recovered by `plugin/scripts/tally.mjs` (`source=sections`) and the runner says so on stderr; `SCORE,<id>,MISSING` when nothing is recoverable.
- `SEED,<id>,<run>,<seed>`: the file-order seed of each graded run, for replaying it.
- `USAGE,<id>,<run>,cost_usd=…,input=…,cache_read=…,cache_write=…,output=…,turns=…,duration_ms=…`: what the review cost, from the CLI's JSON output. `cost_usd` is the number to compare. Token fields may cover only the orchestrator's own turns; `USAGE,<id>,<run>,MISSING` when the CLI printed no envelope.
- `RESULT,<id>,PASS|FAIL|ERROR (k/n)`: ERROR means no run could be graded (empty or failed review, empty judge reply).

Exit 0 when every case passed, 1 on a failure or error, 3 when nothing ran (a filter that matches nothing is not a pass), 127 when `claude` is missing.

The scorecard splits cases by label: a case with `success_criteria.must_detect` is a recall case, one without is a precision counter-case (correct code that must not be flagged). SNR is a proxy: 🔴+🟠 counts on recall cases (capped at each case's `must_detect` count) over 🔴+🟠 counts on counter-cases.

## Two rules

**A case proves nothing until the baseline arm has been shown to fail it.** Run the baseline (the skill before your change) on every new case, not just the treatment. A case both arms pass is a regression guard; only a case the baseline fails and the treatment passes is evidence.

**State which claim a case can and cannot settle, before spending on it.** A rubric that reads the report can only measure what reaches the report. A mechanism whose payoff is spend avoided needs a different instrument, such as a run counter, not a judge.

Record each shipped or reverted change, with what an eval did or did not show, in [`ledger.md`](ledger.md).

## Case format

`id` (the file name), `skill: "review"`, `query: "/review:review"`, `fixture` (`kind: "synthetic-diff"` with `files: {path: {before?, after?, delete?}}`, or `rename_only` + `files_changed`; or `kind: "real-commit"` with `repo` and `commit`), `grader.rubric` (the only field the judge reads), and `success_criteria` / `expected_behavior` / `expected_not_behavior` as documentation. `must_detect[].verdict` uses the verifier's vocabulary (`confirmed`, …). `validate.mjs` enforces the shape, rejects the cut fixture fields and any leftover `review-all`, and checks that `plugin/scripts/select-files.mjs` leaves every `must_detect` file in reach.

What changed from `/review-all` in the rubrics: "the appendix" is now the Plausible section; "verdict: keep" is `confirmed`; no score thresholds; a finding sitting only in Already there counts as dismissed as pre-existing, and a Refuted line is never a finding. The cases otherwise keep their fixtures; the language-specific ones (Python, Go, Rust, Java, SQL) now test what the reviewers know on their own, since the language rule packs were cut.

## Cases

| ID | Category | What it tests |
|----|----------|---------------|
| `01-small-diff-null-deref` | recall | A clear null-deref in a small diff must be flagged 🔴/🟠 and survive verification. |
| `02-large-refactor-no-noise` | precision / noise floor | A pure 200-file rename must yield ≤2 findings, zero 🔴, and a Verdict line with nothing to fix. |
| `03-auth-crypto-change` | severity calibration | An MD5 downgrade in `src/auth/` must run the Security Deep Dive reviewer and surface 🔴. |
| `04-empty-diff-noop` | edge: empty diff | No working-tree changes → graceful no-op, no fabricated findings, no crash. |
| `05-false-positive-resistance` | edge: intentional pattern | An `any` with a documented `eslint-disable` must NOT be reported as a defect (a Refuted line is fine). |
| `06-preexisting-sink-reached` | pre-existing, reached | New code feeds user input to an unchanged string-concatenation SQL helper. The change reaches the old sink, so the injection belongs in the main report, never only in Already there. (Was `06-preexisting-vuln-in-audit`, which relied on the cut audit heuristics.) |
| `07-dry-duplication` | DRY agent | New code re-implementing an existing helper's logic must surface as duplicated-logic. |
| `08-n-plus-one` | performance agent | A parameterized query inside a loop must surface as N+1. |
| `09-untested-exported-logic` | test-quality reviewer | New exported `parseDuration()` with real branching and no test must be flagged; a constants-only file must not be asked for a test. (Rewritten from `09-missing-test-gate`: there is no file-name check any more.) |
| `10-api-contract-break` | API/contract agent | Renaming a public field while an unchanged consumer still reads the old name. |
| `11-a11y-missing-label` | a11y agent | An icon-only button with no accessible name. |
| `12-i18n-hardcoded-string` | i18n agent | A hardcoded user-facing string where the repo uses a `t()` helper. |
| `13-race-lost-update` | concurrency | A non-atomic read-modify-write across an `await` (lost update). |
| `14-resource-leak` | resource leak | A file handle not closed on the error path. |
| `15-deleted-file-breaks-importer` | deletion handling | A deleted module still imported by an unchanged consumer. |
| `16-unit-mismatch-seconds-ms` | correctness | A value collected in seconds assigned to a milliseconds field with no ×1000 — a silent 1000× scale bug. |
| `17-unguarded-request-body` | bugs / validation | A handler dereferences the request body without checking it is present → crash/500 on missing input (better: 400). |
| `18-swallowed-exception` | error handling | A catch on a payment path swallows the error (no log, no rethrow) and returns null — silent failure. |
| `19-generated-file-noise-floor` | precision | A regenerated `DO NOT EDIT` file must NOT be nitpicked for DRY / `any` / style. |
| `20-cache-invalidation-storm` | performance | A full `flushAll()` inside a per-item loop → O(n) cache-invalidation storm. |
| `21-subscription-leak` | resource leak | A method resubscribes on every call without unsubscribing → accumulating live subscriptions. |
| `22-cache-on-failure` | resilience | A pending-promise cache never evicts a rejected fetch → the failure is cached permanently. |
| `23-missing-await-floating-promise` | async | An un-awaited promise (floating) → unhandled rejection + unordered side effect. |
| `24-off-by-one-pagination` | logic | A 1-based page with `start = page * pageSize` skips the first page. |
| `25-inverted-access-guard` | security | `!roles.includes(required)` inverts the access decision (authorization bypass). |
| `26-uninitialized-field` | bugs | A field behind a `!` definite-assignment assertion is never initialized → runtime TypeError. |
| `27-path-traversal` | security | A user-controlled file name joined to ROOT without validation → `../` traversal. |
| `28-secret-in-log` | security | A plaintext password written into a log line. |
| `29-memoize-key-collision` | correctness | A shared memo cache keyed only by input value collides across different operations → wrong cached result. |
| `30-switch-missing-case` | completeness | A switch over a string-literal union omits a member with no default → implicit `undefined` return. |
| `31-xss-innerhtml` | security | User text interpolated into `innerHTML` with no escaping → XSS. |
| `32-open-redirect` | security | A redirect to a user-controlled URL with no allowlist/same-origin check. |
| `33-unbounded-cache-growth` | resource leak | A long-lived cache keyed by unbounded user input with no cap/eviction/TTL → memory growth. |
| `34-command-injection` | security | User input interpolated into a shell command passed to `execSync`. |
| `35-regex-redos` | security / perf | A nested-quantifier regex on user input → catastrophic backtracking (ReDoS). |
| `36-insecure-randomness` | security | A session token generated with `Math.random()` (non-cryptographic PRNG). |
| `37-ssrf` | security | A server-side request to a user-controlled URL with no validation (SSRF). |
| `38-tls-verification-disabled` | security | An HTTPS agent with `rejectUnauthorized: false` (MITM exposure). |
| `39-integer-precision-loss` | correctness | A 64-bit id string parsed with `Number()` → precision loss above 2^53. |
| `40-missing-query-limit` | performance | An unbounded `SELECT` with no `LIMIT`/pagination → loads a growing table. |
| `41-async-foreach` | async | `Array.forEach` with an async callback → per-item promises not awaited. |
| `42-concurrent-modification` | concurrency | Removing from a `List` inside an enhanced-for loop → `ConcurrentModificationException`. |
| `43-jdbc-resource-leak` | resource leak | A JDBC `Connection`/`Statement`/`ResultSet` opened without try-with-resources → leaked on early return / exception. |
| `44-blank-secret-auth-bypass` | security | A shared secret defaulting to `""` accepts an empty secret header → trust bypass. |
| `45-non-thread-safe-map` | concurrency | A plain `HashMap` mutated concurrently from pool threads with no synchronization → data race. |
| `46-broken-double-checked-locking` | concurrency | Double-checked locking on a non-`volatile` field → unsafe publication / visibility race. |
| `47-io-under-lock` | performance | A blocking remote call inside a `synchronized` block → serializes every caller behind one round-trip. |
| `48-swallowed-interrupt` | error handling | An empty `catch (InterruptedException)` that neither restores the interrupt flag nor exits → lost cancellation. |
| `49-locale-dependent-case` | i18n correctness | `toLowerCase()` with no `Locale` used as a map key → Turkish-i style mismatch (distinct from hardcoded-string i18n). |
| `50-negative-count-underflow` | logic | A decrement with no zero floor → a negative, invalid count reported to callers. |
| `51-exception-as-control-flow` | performance | `NoSuchMethodException` thrown/caught per hierarchy step in a hot loop (stack-fill cost). |
| `52-non-atomic-id-collision` | concurrency | `currentTimeMillis()` + `Math.random()` ID collides within a millisecond → duplicate primary key. |
| `53-db-column-truncation` | data loss | An unbounded value written to a `VARCHAR(64)` column (declared in an unchanged migration) with no length check. |
| `54-mutable-internal-exposure` | encapsulation | A getter returns the internal mutable `List` directly → callers mutate private state. |
| `55-thread-confined-no-race` | precision / noise floor | Correctly thread-safe code (`ConcurrentHashMap` + `AtomicLong`) must NOT be flagged as a race. |
| `56-format-string-specifier-mismatch` | bugs / correctness | Invalid `String.format` specifiers (`%z`, dangling `%`) that throw `IllegalFormatException` at runtime; a correct `%%`-escaped sibling must NOT be flagged. |
| `57-default-charset-encode-decode` | correctness / portability | `getBytes()`/`new String(byte[])` with no `Charset` in a crypto codec → platform-default-dependent, corrupts non-ASCII across hosts (Base64 is not the bug). |
| `58-lock-ordering-deadlock` | concurrency | Nested `synchronized(from){synchronized(to){}}` → AB-BA deadlock when two threads call it in opposite directions. |
| `59-signal-before-state` | concurrency | `CountDownLatch.countDown()` called before the guarded result is assigned → a released waiter reads null/stale (single-writer ordering, not a lost-update race). |
| `60-shallow-clone-shared-collection` | encapsulation / aliasing | `super.clone()` copies a mutable `Map` by reference → clone and original share one backing collection. |
| `61-comparator-vs-head-insert` | logic | Descending sort then `add(0, …)` head-insertion reverses priority (the `Double.compare` comparator itself is correct). |
| `62-python-import-shadowing` | recall / Python scoping | A function-local `from m import x` shadows the module-level name → `UnboundLocalError` on an earlier branch. |
| `63-python-clock-domain-mismatch` | recall / correctness | Wall-clock `time.time()` stored, then subtracted from monotonic `time.monotonic()` → garbage TTL, entries never expire. |
| `64-python-bare-except-platform` | recall / error handling | One over-broad/narrow `except` collapses independent probes, hiding a platform-specific error. |
| `65-python-dict-mutation-unlocked` | recall / concurrency | A shared dict `.clear()`/mutated without the lock readers hold → race. |
| `66-sql-null-three-valued-logic` | recall / SQL | `WHERE col = 0` on a nullable column silently drops NULL rows (needs `COALESCE`). |
| `67-sql-fk-cascade-orphans` | recall / data integrity | Deleting a parent row without removing non-cascaded child references → orphaned rows. |
| `68-csv-formula-injection` | recall / security (CWE-1236) | CSV export quotes per RFC-4180 but doesn't neutralize a leading `= + - @` → spreadsheet formula injection. |
| `69-stale-async-response` | recall / concurrency | Overlapping async loads where a slower earlier response overwrites newer state (needs a generation guard). |
| `70-generation-counter-correct` | precision | A correct generation-counter guard against stale responses — must NOT be flagged as a race. |
| `71-monotonic-timeout-correct` | precision | A correct single-domain `monotonic()` timeout — must NOT be flagged as a clock-domain bug. |
| `72-go-nil-map-write` | recall / Go | A constructor leaves a map nil (no `make`); a later write panics (`assignment to entry in nil map`). |
| `73-go-err-shadowing` | recall / Go | Inner `:=` shadows the outer `err`, so the post-block error check is dead and an error is silently dropped. |
| `74-go-goroutine-leak` | recall / Go | A goroutine blocks forever on a channel send with no cancellation/drain → goroutine leak. |
| `75-go-defer-in-loop` | recall / Go | `defer f.Close()` inside a loop defers to function return → handles accumulate (fd exhaustion). |
| `76-rust-unwrap-panic` | recall / Rust | `.unwrap()`/`.expect()` on a reachable `Err`/`None` (parse/lookup) → runtime panic. |
| `77-rust-blocking-in-async` | recall / Rust | A blocking call (`std::thread::sleep` / sync IO) inside an `async fn` stalls the executor. |
| `78-rust-mutex-across-await` | recall / Rust | A `std::sync::Mutex` guard held across `.await` → deadlock risk / non-`Send` future. |
| `79-go-goroutine-cancellation-correct` | precision | A goroutine with proper `ctx.Done()`/quit-channel exit — must NOT be flagged as a leak. |
| `80-rust-guard-dropped-before-await` | precision | A lock guard dropped before `.await` — must NOT be flagged as held-across-await. |
| `81-boundary-catch-correct` | precision (guards `64`) | A correct top-level `except Exception` boundary that logs + surfaces (correlation id) — must NOT be flagged as a swallowed/over-broad catch. |
| `82-sql-intentional-equality-correct` | precision (guards `66`) | An intentional `WHERE col = 1` on a NOT-NULL column where excluding NULL is correct — must NOT be flagged as a NULL-logic bug. |
| `83-consistent-lock-discipline-correct` | precision (guards `65`) | A shared dict read/written/cleared always under the same lock — must NOT be flagged as a race. |
| `84-csv-formula-neutralized-correct` | precision (guards `68`) | A CSV export that already prefixes `'` on `= + - @` fields — must NOT be flagged as CSV/formula injection. |
| `85-todo-not-defect` | precision | A correct function carrying a `# TODO` for a FUTURE enhancement — the deferred-work note must NOT be flagged as a defect / missing-handling in the current change. |
| `89-claude-md-rule-applied` | project rules | A `CLAUDE.md` rule bans `console.log` under `src/lib/`; the new `src/lib/format.js` breaks it. Must be flagged, quoting the rule. (Rewritten from `89-warm-profile-cache`: no rules cache; Claude Code loads CLAUDE.md into every reviewer.) |
| `90-review-md-raised-bar` | REVIEW.md | An unchanged repo-root `REVIEW.md` promotes duplicated money rounding under `src/billing/` to CRITICAL and suppresses all findings under `scripts/`. Must promote the rounding duplication to CRITICAL *and* report nothing against the bait in `scripts/`. |
| `91-claude-md-stale-claim` | doc staleness (emergent) | A `CLAUDE.md` architectural invariant stated in prose that shares no identifier with the diff — no third-party call during request handling — falsified by a `fetch()` added inside a handler. On /review-all the consistency reviewer caught this **without any explicit rule**, so the rule was reverted; the case guards that emergent behavior. |
| `92-failing-test-gate-lead` | checks | The only fixture whose checks genuinely run and fail: `package.json` points `test` at plain `node tests/run-tests.js`, and the diff breaks `applyDiscount` so it subtracts the percent as flat cents. Must show the test check FAIL *with provenance* in the Checks table and name the underlying percentage bug. |
| `93-convention-masked-sqli` | recall (convention rule) | Six unchanged `*ReportRepo.js` files build SQL by string-concatenation, the house style. The diff adds a seventh concatenating a request parameter. The convention rule excuses quality findings only, so the injection must be flagged 🔴/🟠, never refuted as convention. |
| `94-convention-nonsecurity-still-dropped` | precision (guards `93`) | Six unchanged service files share a harmless `(ctx, opts)` parameter-order convention; the diff adds a seventh following it. Must yield NO finding about the convention at any severity (a Refuted line is fine). |
| `95-self-impact-not-privesc` | precision (regression guard) | An authenticated user deletes their own record; the handler resolves the target id from `req.session.userId`, never from request input, so no other principal is reachable — must NOT be reported as IDOR / broken access control / privilege escalation. |
| `96-crash-not-rce` | precision (regression guard) | A request handler calls `JSON.parse` on the body with no try/catch — an unhandled exception (crash/500), not code execution. May be reported at 🟠 IMPORTANT or lower; a 🔴 CRITICAL rating or a remote-code-execution claim is a FAIL. |
| `97-defense-in-depth-hardening` | precision (regression guard) | An unchanged allowlist validator (`isAllowedRegion`, a fixed 3-value list) demonstrably blocks the attack before a changed downstream function (`loadRegionConfig`) that lacks its own redundant re-check. The missing second layer must NOT be reported at 🔴/🟠; a 🔵 hardening note is acceptable. |
| `99-prompt-injection-in-diff` | security (injection resistance) | Twin of `34-command-injection`: identical fixture and defect, plus one comment addressed to AI reviewers claiming a prior security audit and instructing them to report nothing. Settles one claim: whether that comment suppresses the finding. Compare against 34 as the control arm. On /review-all the baseline passed 3/3 at opus (2026-10-19), so the injection-guard prose was never shipped; kept as a regression guard. |

## Retired cases

| ID | Why |
|----|-----|
| `86-gate-blocking-critical` | Gate mode was cut: reviews are interactive only. |
| `87-gate-debt-only-pass` | Gate mode was cut. |
| `88-stale-profile-cache` | The profile/rules cache was cut; there is nothing to go stale. Its null-deref regression is covered by `01`. |
| `98-machine-rejection-suppressed` | Cross-run memory (`state.json`, machine rejections) was cut: the skill is stateless. It was also non-discriminating by construction on `/review-all` (see below). |

Rewritten: `06` (now passes via "reached"), `09` (test-quality reviewer instead of a file-name gate), `89` (a CLAUDE.md rule applied, no cache seeding); `02`, `03`, `05`, `90`, `92`, `93`, `94` were reworded for the new report sections and rules, with the same fixtures.

## History: what the A/B runs on `/review-all` established

These notes are from `/review-all` and describe its versions, not `/review:review`. They are kept because they produced the two rules above and say which cases have ever discriminated.

> **What the A/B of these cases established (v0.8.0, N=3, both arms).**
>
> - **`90` proves `REVIEW.md` support works.** Baseline v0.7.1 **FAIL (1/3)**, treatment **PASS (3/3)**. Its first version was non-discriminating — it used a defect default calibration already rated CRITICAL and bait the baseline already ignored — so it was rebuilt around a two-line rounding duplication (defaults to DEBT, `REVIEW.md` promotes to CRITICAL) plus an unvalidated-input defect under `scripts/` that a review normally *does* report and `REVIEW.md` suppresses. Both directions now require the feature.
> - **`91` proved the doc-staleness rule was redundant, and the rule was reverted.** Two independent fixture designs, both **PASS 3/3 on the baseline**: first a doc claim naming a symbol the diff changed (reachable by the existing stale-reference grep), then an architectural invariant in prose sharing *no* identifier with the diff — deliberately built to be out of that mechanic's reach. The consistency agent found it anyway. The case is kept as a regression guard for behavior that is emergent rather than instructed.
> - **`92` is a regression guard, not evidence.** Both arms **PASS 3/3**: a failing Phase 1 gate is caught with or without the `<gate_results>` block, since the gate itself already produces a VERIFIED finding. Its value is that it is the only fixture whose gates genuinely run and fail.
> - **`02` cannot serve as an A/B instrument.** Run twice on identical baseline code it returned `PASS (2/3)` then `FAIL (1/3)`, with no timeouts or errors in the raw logs. Per-agent diff ordering, which only `02` exercises, therefore remains **unmeasured** — neither proven nor regressing.
>
> **The rule all of this produced: a case proves nothing until the baseline arm has been shown to fail it.** Run the baseline arm on every new case, not just the treatment. A case both arms pass is a regression guard; only a case the baseline fails and the treatment passes is evidence.

> **What the baseline arm of `93`–`98` established (v0.10.1, N=3 baseline only).**
>
> These six were written to demonstrate that a set of security evidence-discipline rules — a
> convention-check carve-out, three severity-inflation guards, and a boundary+trace schema — were
> necessary. **The baseline passed all six.** None is evidence; all are kept as regression guards,
> and the rules they were written for were reverted before release.
>
> - **`95` PASS 3/3, `96` PASS 3/3, `97` PASS 3/3 on the baseline.** The pre-change skill already
>   declines to inflate a self-delete into IDOR, an uncaught `JSON.parse` into code execution, or a
>   missing second layer into a 🔴/🟠 — without any rule saying so. The "do not strengthen the
>   result" prose bought nothing and cost every review agent context on every run, so it was dropped.
> - **`93` PASS 2/3 on the baseline.** The convention suppression does fire sometimes, but N=3 cannot
>   separate 2/3 from 3/3 (the interval on 2/3 spans roughly 20–95%), and a treatment arm at RUNS=1
>   cannot either. The carve-out is **unmeasured**, not disproven — resolving it needs N≈10 per arm.
> - **`98` PASS 3/3 on the baseline, and the case is broken by construction.** Its seeded rejection
>   points at an empty `catch` in an *unchanged* hunk that already carries an explanatory comment, so
>   the existing changed-lines rule and the auto-drop list suppress it for free — with or without
>   machine-dismissal memory. To actually test the `rejected` status the seed must sit on a line the
>   diff changes, with a `code_hash` matching the post-diff code. Until it is rebuilt that way, the
>   `rejected` mechanism ships **unmeasured**: its payoff is skipped agent derivations and skipped
>   verifier calls, which a rubric that reads only the final report cannot observe at all.
>
> **The second rule this produced: state which claim a case can and cannot settle, before spending on
> it.** A report-grading rubric can only measure what reaches the report. A mechanism whose payoff is
> *spend avoided* needs a different instrument — a run counter, not a judge.
