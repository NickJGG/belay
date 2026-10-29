---
name: build
description: Build or extend a verified course. Interviews, surveys the subject, collects sources, writes cited knowledge and exercises, and verifies every claim. Expensive and long-running; only on request.
argument-hint: <subject | course> [--units <n|n-m>] [--extend "<area>"] [--verify] [--add-source <path|url>]
disable-model-invocation: true
---

# /learn:build

You coordinate a course build. Agents do the research and writing in a Workflow; you run the interview, the two checkpoints, book ingestion and the bookkeeping between runs.

- Plugin root `P`: `${CLAUDE_PLUGIN_ROOT}` (if that appears unexpanded, it is `C:\Users\Nick\Projects\Tools\belay\extensions\learn\plugin`).
- Learning root: `$LEARNING_ROOT`, default `C:\Users\Nick\Learning`. The course folder is `<root>\<course>`.
- Read `P/references/formats.md` first. It is the contract for every file named here.
- The workflow is `P/skills/build/workflow.js`. Run it with the Workflow tool's `scriptPath` and an `args` object (below). Never edit it during a build.
- Book text and cached sources stay local. Never publish them or send them anywhere.

## Route

Parse `$ARGUMENTS`. Slugify the subject to a course slug and look for `<root>\<slug>\course.md`. If it isn't there, also try the argument as a slug.

- No course: start a new build at **Interview**.
- A course whose `build` is short of `accepted`: resume from that stage. `interviewed` → Survey. `surveyed` → Checkpoint 1. `approved | collected | written` → Produce. `verified` → Checkpoint 2.
- An accepted course with no flag: say so. If `syllabus.md` has units not in `ready`, offer `--units` for the next one or two. Otherwise offer `--extend`, `--verify` and `--add-source`.
- Flags are run on an existing course: see **Flags**.

Before any Workflow run, say in one line what it will do and roughly how many agents it will use.

## Interview

Follow `P/skills/build/references/interview.md`. It ends with `course.md` written (`build: interviewed`), `.build/interview.md` saved, and any owned books ingested (see **Ingest a source**).

## Survey

Workflow `args`: `{mode: "survey", tag: "base", plugin, course, date}`. For `--extend`, use `tag: <area slug>, area: "<area>"`.

When it returns, set `build: surveyed`.

## Checkpoint 1 · plan

Show the proposal in `.build/survey/<tag>/plan.md`, and point to `.build/survey/<tag>/map.md` for viewing in Obsidian. Cover:
- Units and topics.
- What's in scope and what's out, with reasons.
- The backbone candidates. Recommend one, or none if nothing fits, in which case the survey's sequence is used.
- The proposed traits.
- The first batch: which units to build now. All by default; offer a smaller first batch (say units 1–2) so sessions can start sooner. The rest stay approved and are built later with `--units`.
- The estimate for the batch: `agents ≈ 9 × topics + units + 1`, at about 50–150k tokens per agent. Wall-clock is about `agents ÷ 10 × 5–10 min`. Say plainly that this is a rough guess.

Ask the user to approve or adjust, one point at a time. Make small adjustments by editing the proposal's `plan.json`. For large ones (a different goal or a much wider scope), rerun Survey.

On approval:
1. Merge the proposal into `.build/plan.json`, the approved master: `{units, out, traits, backbone: {id, title, url, access}}`. For an extend, append its units after the existing ones and continue the numbering. Topic slugs must be unique across the course.
2. Copy the proposal's `map.md` to `map.md`.
3. Update `course.md`: `scope.in` gets the topic slugs, `scope.out` the out areas, plus `traits`. Set `backbone` to `"[[sources/<id>]]"`. For a backbone split by chapter, use the first chapter's id with a note in the body. Leave it empty if there is none. Set `build: approved`.
4. Go to Produce with the chosen batch.

## Produce

Produce builds one batch of units: the one chosen at Checkpoint 1, or by `--units`. Work out what is already done for every topic in the batch from its marker files. Each stage writes its marker last, so a marker means that stage finished:

| stage | marker |
|---|---|
| `collect-primary` | `.build/collect/<slug>.primary.md` |
| `collect-practice` | `.build/collect/<slug>.practice.md` |
| `write` | `.build/write/<slug>.md` |
| `verify` | `.build/verify/<slug>.md` |

Workflow `args`:
```
{mode: "produce", plugin, course, date,
 topics: [{slug, title, unit}],              // every batch topic without a verify marker
 done:   {<slug>: ["collect-primary", …]},   // the markers present
 claims: {<slug>: [{id: "c1", source}, …]},  // for topics with write done but no verify: every
                                             // ^c<n> in knowledge/<slug>.md, with the id of the
                                             // first [[sources/<id>]] its paragraph cites
 units:  [{n, title, topics: [slugs]}],      // batch units with no rubrics/unit-<n>.md yet
 fill:   {<slug>: "<what to add>"}}          // gap-fill only (Checkpoint 2, --add-source)
```

If the same session ran the workflow and it stopped partway, rerun it with `resumeFromRunId` instead. Its cache is cheaper than the markers.

After the run, report any `failed` topics. Then set `build` to the lowest stage every batch topic has reached: all verify markers → `verified`, all write → `written`, all collect → `collected`, otherwise leave it at `approved`. With failures, offer to rerun, which resumes. Otherwise go to Checkpoint 2.

## Checkpoint 2 · results

Use the workflow's `summary`. When resuming in a new session, use `verification.md`, `sources/index.md` and the `.build/write/*.md` Gaps instead:
- Totals for claims checked, verified, corrected and cut.
- A per-topic table: sources, claims, cut, exercises.
- The gaps. Add your own on top of what the assembler reported: fewer than 2 sources, fewer than 3 exercises, a cut rate over 25%, or fewer than 5 claims.
- The syllabus, from `syllabus.md`.

The user accepts, or names gaps to fill. To fill gaps, run Produce with `fill` set for those topics and with their `write` and `verify` left out of `done`. Collectors and writer add to what exists, and only the new claims and exercises are verified. Then come back here.

On accept, add the batch units to `ready` and set `build: accepted`. Tell the user that `/learn:learn <course>` starts or continues sessions, and which units are still unbuilt.

## Flags

- `--units <n|n-m>`: build approved units not yet in `ready`. Say which topics and roughly how many agents, set `build: approved`, then Produce with those units as the batch, and Checkpoint 2. Sessions keep working on the ready units throughout.
- `--extend "<area>"`: Survey with the area, then Checkpoint 1 (its units become a batch of their own), Produce, and Checkpoint 2. Sessions keep working on the ready units throughout.
- `--add-source <path|url>`: **Ingest a source**. Then ask whether it should become the backbone; if so, set `role: backbone` in its frontmatter and in `course.md`, and demote the old backbone to `supporting`. Then offer to enrich the topics it covers: Produce with those topics, `fill: {<slug>: "integrate sources/<id>"}`, all collect stages in `done`, and write and verify left out.
- `--verify`: read `verify.md` and take the lines without ` → `. Give each one a topic from `scope.in`. An item with no topic is resolved immediately as ` → rejected: outside course scope (try --extend)`. Show the list and confirm. Then run the workflow with `{mode: "resolve", plugin, course, date, items: [{n, line, kind: "unverified" | "dispute", topic, claim}]}`. For each returned item, append ` → folded <topic>^<id>` or ` → rejected: <reason>` to line `n`. An item with `outcome: null` stays open. Don't change any other part of a line, and never delete one.

## Ingest a source

1. Find the text:
   - PDF: `pdftotext -layout`.
   - EPUB, MOBI, DOCX or HTML: Calibre's `ebook-convert <in> <out>.txt`.
   - Otherwise `pandoc`, if it's on PATH.
   - Check `py -c "import pypdf"` before relying on it.
   - Last resort: the Read tool's PDF support, 20 pages at a time.
   - A URL: WebFetch, keeping the main text.
   Work in the scratchpad and write only the results into the course.
2. Split a book by chapter into `sources/<id>-ch<n>.md`, and save anything shorter as `sources/<id>.md`. Each file starts with the frontmatter from formats.md, with `url` set to the URL or `(own copy) <path>`.
3. Don't touch `sources/index.md`. The next Assemble rebuilds it from the frontmatter. If no workflow run is coming, add the row yourself.

## Course.md and the plan files

Only you write `course.md`, `.build/plan.json`, `map.md` and `verify.md`. Agents write the rest. Keep `course.md` frontmatter keys in the order formats.md shows.
