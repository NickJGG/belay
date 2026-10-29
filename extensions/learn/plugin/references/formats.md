# Course formats

The single source of truth for a course folder. Skills and scripts read this instead of restating it; change the format here first.

Courses live in `C:\Users\Nick\Learning\<course>\` (scripts honour `$LEARNING_ROOT`). `<course>` is a short kebab-case slug. `Learning\` is an Obsidian vault, so notes use Obsidian links, `$…$` maths and Mermaid.

## Layout

```
<course>/
  course.md            definition: goal, level, traits, scope       (build)
  syllabus.md          units → topics with status, checkpoints      (build; sessions update status)
  map.md               Mermaid map of the subject, scope marked     (build)
  sources/             cached source text, one file per source      (build)
    index.md           source register
  knowledge/<topic>.md cited claims — the tutor's ground truth       (build)
  exercises/<topic>.md problems with worked solutions               (build)
  rubrics/unit-<n>.md  checkpoint marking criteria                  (build)
  misconceptions.md    known errors: field + learner's own          (build seeds; sessions append)
  verification.md      build verification totals and reasons        (build)
  verify.md            unverified claims and disputes, append-only  (sessions)
  cards.md             review cards with FSRS state                 (sessions, via scripts/cards.js)
  log.md               one entry per session                        (sessions)
  now.md               scratch page for notation/diagrams, overwritten freely (sessions)
  lessons/             one note per session                         (sessions)
  work/                the learner's own attempts — never edited by the tutor
  corrections.md       language trait only: recurring errors        (sessions)
  .build/              build pipeline internals; not for reading in sessions
```

Topic slugs are kebab-case and shared across `knowledge/`, `exercises/`, `syllabus.md` and card headers.

## `course.md`

```markdown
---
goal: "Concrete end state, e.g. 'derive and apply the chain rule to any composite of elementary functions'"
level: "Where the learner starts"
traits: [notation, code]        # any of: notation | code | language | reading
backbone: "[[sources/<id>]]"     # the primary source the syllabus follows
scope:
  in: [limits, derivatives]
  out: [multivariable]
build: interviewed | surveyed | approved | collected | written | verified | accepted
ready: [1, 2]                    # units accepted for sessions
reading: start                   # start | off: unit reading from owned book chapters
read-after: [9, 10]              # units where the learner attempts first and reads after
created: YYYY-MM-DD
---

Free-text notes: time budget, books owned, anything the interview turned up.
```

Units are built in batches. `build` records the last finished pipeline stage of the batch being built; `accepted` means no batch is in progress. `ready` lists the units accepted so far, and sessions and checkpoints use only those, so units 1–2 can be studied while later ones build. A course with no `ready` key and `build: accepted` (built before batches existed) has every unit ready.

`reading` and `read-after` are optional; absent means `off` and no units. The build chooses each unit's reading and writes it to `syllabus.md` as reading lines.

## `syllabus.md`

```markdown
# Syllabus

## Unit 1 · Limits
- [x] read · stewart-ch2 · done · Stewart ch. 2 · The Limit of a Function; Limit Laws
- [ ] limit-definition · todo
- [ ] one-sided-limits · in-progress
- [x] limit-laws · done
- checkpoint 1 · pending

## Unit 2 · Derivatives
…
```

- Every approved unit is listed, built or not; `ready` in `course.md` says which can be studied.
- Topic lines: `- [ ] <topic slug> · todo | in-progress | done`; the box is `[x]` exactly when the status is `done`.
- Reading lines (`reading: start` only): `- [ ] read · <source-id> · todo | done · <label> · <sections>`, sections separated by `; `. The box is `[x]` exactly when the status is `done`. Position is sequence: they go before the unit's topics, or after them in a `read-after` unit. The build writes them; `scripts/courses.js read <course> <source-id> [--undo]` marks a source done in every unit that lists it. Don't hand-edit the status.
- Each unit ends with a checkpoint line: `- checkpoint <n> · pending | pass YYYY-MM-DD <score>% | partial YYYY-MM-DD <score>% | fail YYYY-MM-DD <score>%`. A rerun replaces the result.

## `knowledge/<topic>.md`

One claim per paragraph or list item, each ending in a source citation and an Obsidian block ID:

```markdown
# Chain rule

The derivative of $f(g(x))$ is $f'(g(x))\,g'(x)$. [[sources/stewart-ch3]] "the derivative of the composite function … is the derivative of the outer function evaluated at the inner function times the derivative of the inner function" ^c1
```

- Block IDs are `^c<n>`, unique within the file, never reused after a claim is cut.
- Citation: `[[sources/<id>]]` plus a short quoted span (under ~30 words) that supports the claim.
- A claim without a citable passage is not written. Cut claims are recorded in `verification.md`, not left behind.
- The tutor cites a claim as `[k:<topic>^c3]` in the terminal and as `[[<topic>#^c3]]` in notes (clickable in Obsidian).

## `sources/`

- `sources/<id>.md` holds the cached text, verbatim, under a frontmatter block that `sources/index.md` is rebuilt from. `<id>` is a kebab-case slug; a book is split per chapter as `<id>-ch<n>`. Its text is written once and never rewritten; only `role` may change.

```markdown
---
title: "Stewart, Calculus, ch. 3"
url: '(own copy) C:\Users\Nick\Books\stewart.pdf'
accessed: 2026-10-21
licence: personal copy
role: backbone
---
```

- `sources/index.md` has one row per source:

```markdown
| id | title | url or path | accessed | licence | role |
|----|-------|-------------|----------|---------|------|
| stewart-ch3 | Stewart, Calculus, ch. 3 | (own copy) | 2026-10-21 | personal copy | backbone |
```

`role` is `backbone` or `supporting`. Extracted book text stays local and is never published.

## `exercises/<topic>.md`

```markdown
## e1 · apply
Problem statement.

<details><summary>Solution</summary>

Worked solution, step by step, citing [[chain-rule#^c1]] where used.
</details>
```

Heading: `## e<n> · recall | apply | analyse | transfer`.

## `rubrics/unit-<n>.md`

A task template per trait in the course, then numbered criteria, each with points and what full / partial / no credit looks like. Pass is about 80% of total points.

## `misconceptions.md`

```markdown
# Misconceptions

## Known in the field
- **<topic>** · <the misconception> — <why it is wrong> [[sources/<id>]]

## Mine
- YYYY-MM-DD · **<topic>** · <what I got wrong> — <the correction> · revisited: YYYY-MM-DD, …
```

The build seeds *Known in the field*; sessions append to *Mine* and add revisit dates.

## `verification.md`

Totals (claims checked, verified, corrected, cut; exercises checked, corrected, cut), then one line per corrected or cut item: `<topic>^c<n> · corrected | cut · <reason>` or `<topic>#e<n> · corrected | cut · <reason>`. Rebuilt by the build from `.build/verify/`.

## `verify.md`

Append-only. One item per line:

```markdown
- YYYY-MM-DD · unverified · <claim> · from session <date>
- YYYY-MM-DD · dispute · <topic>^c<n> · <learner's objection>
```

`/learn:build --verify` resolves items by appending ` → folded <topic>^c<n>` or ` → rejected: <reason>`; lines are never deleted.

## `cards.md`

One block per card; the scripts own the IDs and the `fsrs` line.

```markdown
### c-0007 · <topic>
Q: …
A: …
<!-- fsrs {"due":"YYYY-MM-DD","s":0,"d":0,"reps":0,"lapses":0,"last":null,"state":"new"} -->
```

- IDs are `c-` plus four or more digits, increasing, never reused.
- `Q:` and `A:` may run over several lines. Maths uses `$…$` (Anki export converts it to `\(…\)`).
- `fsrs` fields: `due` next review date, `s` stability (days), `d` difficulty (1–10), `reps`, `lapses`, `last` last review date, `state` `new | review | relearning`. Key order is fixed.
- Text before the first card is free and preserved.
- Use `scripts/cards.js` for every change: `due`, `grade`, `add` (takes a file of `### <topic>` blocks with `Q:`/`A:`; assigns IDs and new state), `edit` (takes a file of `### c-NNNN` blocks with `Q:`/`A:`; replaces only their text, keeping ID, topic and `fsrs`), `stats`. Don't hand-edit `fsrs` lines.

## `log.md`

Newest last, one entry per session:

```markdown
## YYYY-MM-DD · full | quick | review | checkpoint | voice · HH:MM
- topics: <slugs>
- cards: <n> reviewed (<again> again)
- cards added: <n>
- quiz: <score>/5
- checkpoint: unit <n> · pass | partial | fail <score>%
- misconceptions: <new or revisited>
- skipped: <steps, if any>
- reading: <sources and sections given> · unit <n> reading done | in progress | skipped
- next: <topic or action>
- ended: complete | early
```

- `HH:MM` is the local start time (24-hour). Entries from before it existed have none.
- Lines that don't apply are left out (a `review` entry has `cards` and `ended`). `topics` is comma-separated.
- `ended: early` when the learner stopped before the routine's last step. An older entry without `ended:` counts as `early` when its `skipped:` says it stopped.
- `scripts/courses.js` parses the entries as sessions and reads the last heading as the last session.

## `lessons/`

`lessons/YYYY-MM-DD-<topic>.md`: what was covered, key claims as `[[<topic>#^cN]]` links, exercises done, the learner's teach-back, the reading given, open questions.

Exercises done are one line each, `- e<n> · alone | with hints | not solved`, optionally followed by ` — <note>`. `scripts/courses.js` reads them to tell whether an apply-or-harder exercise was solved alone.

A checkpoint's note is `lessons/YYYY-MM-DD-checkpoint-<n>.md`: the task file, the marking table (criterion · points · gap), score and result, clarifications given, weak topics as `[[<topic>#^cN]]` links.

## `work/`

The learner's files: attempts, code, essays, `project/` (code trait: the hand-built project), `checkpoint-NN.md` (with code in `checkpoint-NN/`), `voice-NN.md` prompts and their pasted transcripts as `voice-NN-transcript.md`. The tutor reads them and may create a new file for a task it sets, but never edits what the learner wrote.

## `corrections.md` (language trait)

```markdown
- **<pattern>** · wrong: "…" → right: "…" · seen: YYYY-MM-DD ×<n>
```
