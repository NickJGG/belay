---
name: grill
description: >-
  Interview the user relentlessly about a plan or design, walking down each
  branch of the decision tree and resolving dependencies one by one, until
  shared understanding is reached. Sessions live on the Belay site, where
  they can be read, answered and steered from the browser.
when_to_use: >-
  When the user says "grill me on X", "interrogate me about X",
  "challenge my idea", "stress-test this plan", "force me to think through
  X before planning", or otherwise wants relentless devil's-advocate
  questioning before a plan.
argument-hint: <optional one-line topic | resume [slug]>
allowed-tools:
  - AskUserQuestion
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - EnterPlanMode
  - ExitPlanMode
  - mcp__plugin_belay_belay__attach
  - mcp__plugin_belay_belay__reply
  - mcp__plugin_belay_belay__show
  - mcp__plugin_belay_belay__choice
  - mcp__plugin_belay_belay__detach
---

# Grill

Interview the user relentlessly about a plan or design until shared understanding is reached. Walk down each branch of the decision tree, resolving dependencies between decisions one at a time. For each question, **recommend an answer**. If a question can be answered by exploring the codebase, explore the codebase instead of asking.

- Plugin root `P`: `${CLAUDE_PLUGIN_ROOT}` (if that appears unexpanded, it is `C:\Users\Nick\Projects\Tools\belay\plugin`).
- Sessions dir `S`: `C:\Users\Nick\Belay\grills`. Each session is a folder `S\<slug>\`; its files are described in [`references/session-format.md`](./references/session-format.md). Read that once per conversation, before the first save.
- The site (Belay, run by `belay serve`): `http://127.0.0.1:4747`, a session at `/s/<slug>`.

Sessions persist as `session.json`, the source of truth, so a grilling can be resumed across conversations. `<slug>.md` is rendered from it for belay and is never edited by hand. When the session touches domain vocabulary, terms are also captured to the project's `CONTEXT.md` — see [Glossary writes](#glossary-writes). When questions propose visible frontend changes, they get a mock the Belay site draws — see [Mocks](#mocks).

## Inputs

`$ARGUMENTS` shape decides the entry path:

- `<topic>` — start a fresh session with this topic.
- *(empty)* — if any in-progress sessions exist, offer resume; otherwise open with **"What's the idea?"** and wait for the user.
- `resume` — list in-progress sessions and ask which to pick up.
- `resume <slug>` — resume that specific session directly without asking.

## Phase 0 — Start or resume

1. Parse `$ARGUMENTS` per the rules above.
2. **Channel check**, once: `echo "${BELAY_CHANNEL:-}"`. `1` means this terminal was started with `belay claude`, so the Belay channel is loaded and the session will be **attached** (step 5). Anything else: **terminal-only**. Print once "Browser view needs the channel: quit and run `belay claude --resume`.", then never attach, never call `reply`, `show` or `choice`, and use `AskUserQuestion` for dialogs. Everything else (session files, chat log, mocks) is the same.
3. **Resume path** (`resume`, `resume <slug>`, or empty-with-sessions-present):
   - Glob `S/*/session.json`, read each, filter to `"status": "in-progress"`, sort by `updated` desc.
   - If `resume <slug>` matches, load it directly. A `S/<slug>` with no `session.json` (only `<slug>.md`) is a legacy grill: say it's read-only and can't be resumed, and stop. Otherwise ask via `AskUserQuestion` (nothing is attached yet) — up to 3 sessions (slug + topic preview) plus a 4th "Start fresh instead" option.
   - On load: replay the resolved questions and their `answer` digests into working memory, read `open` to know where to pick up, then jump to Phase 1 at the next unresolved branch.
   - If the session has mocks, print `http://127.0.0.1:4747/s/<slug>` once. Don't open it: a resumed session reopens nothing. Never copy the templates or the app CSS again.
4. **Fresh path**: ask for the topic if it wasn't passed, derive a kebab-case slug (≤6 words; append `-2`, `-3` when `S/<slug>` exists), and proceed to Phase 1. Defer writing `session.json` until the first Q&A is resolved.
   - **Project tag**: run `belay project which 2>/dev/null` once. If it prints a key, set `"project": "<key>"` in the new session. If it prints nothing or `belay` isn't installed, leave the field out. Never ask about it.
5. **Attach** (attached sessions, both paths, as soon as the slug is known): call `mcp__plugin_belay_belay__attach` with the slug and `sessionId: "${CLAUDE_SESSION_ID}"`. The session now shows under Live on the Belay site. If the tool is missing or fails, say so in one line and carry on terminal-only.

## Phase 1 — Grill loop

Style rules:

1. **One question at a time.** Never batch. Number your questions.
2. **Walk the decision tree.** Resolve parent decisions before their children. When an answer opens new branches, queue them and pick the next blocking one.
3. **Always recommend an answer.** Confident defaults speed the conversation; the user only has to override when they disagree.
4. **Explore the codebase first.** If a question can be answered by reading code, config, docs, or git history — answer it yourself (Glob/Grep/Read/Bash) and tell the user what you found, instead of asking. Only ask the user about things only the user knows: intent, priorities, constraints, taste.
5. **Push back on dodges.** If the user is vague ("whatever", "I don't know", "doesn't matter") and the decision matters for the plan, push back **once** with why it matters. If they still won't engage, **propose an answer** and ask them to confirm, edit, or reject. Don't push back twice on the same question.
6. **Probe substantive answers one level deeper.** Challenge an assumption, surface a contradiction with an earlier answer, or pry for a missing detail. Move on once the answer holds.
7. **Label options `a · Short name`.** Lowercase letters, each followed by a short name: `a · Pill on the title row`. No Greek letters, no Roman numerals, no uppercase, no ornamental notation. They're harder to type back and feel pretentious for an enumeration. Sub-options inside one option are numbered (1/2/3). The question's `opts` in `session.json` are the source: `key`, `name` (the name only) and `expl` (the one-liner). Messages show `key · name`, in the same order, so `b` means the same thing on the site and in the conversation. Write the question into `session.json` first, then the message. Once shown, a letter keeps its meaning. A new alternative to the question takes the next free letter.
   **Variants.** When the user points at an option and asks to change or explore it ("d, but…", "iterate on d"), the results are variants of it, keyed parent + number (`d1`, `d2`…) with `"from": "d"`. A later round on a variant keeps counting under the root (`d5`, `"from": "d3"`). The site groups a family after its root. In messages, list only the new round, under a header naming the parent:
   ```
   Variants of d3 · Labelled outline:
   - d5 · Flush outline, label on the edge: … (Yours) ← my rec
   ```
   Don't repeat earlier rounds or the other options; The site's option selector already shows them.
8. **Challenge against the glossary.** If a `CONTEXT.md` exists and the user uses a term that conflicts with it, surface the mismatch immediately. "Your glossary defines `Match` as X, but you seem to mean Y — which is it?"
9. **Sharpen fuzzy language.** When the user uses vague or overloaded terms ("account", "session", "phase"), propose a precise canonical alternative and ask which they mean.
10. **Probe with concrete scenarios.** When domain relationships are being decided, invent specific edge cases that force the user to be precise about boundaries between concepts. "What happens if the player disconnects mid-grace?"
11. **Cross-reference with code.** When the user states how something works, check whether the code agrees (Glob/Grep/Read). If you find a contradiction, surface it: "you said the win condition is delivery, but `WinConditionWatcher` is tracking deaths — which is right?"

### Where to answer

In an attached session the user may type in the terminal or on the Belay site. **Answer wherever they last typed.**
- Their latest message arrived as `<channel source="belay">`: send the whole answer (the next question, its options, my rec) with `mcp__plugin_belay_belay__reply`, and keep terminal text to one short line. The bridge logs both sides to `chat.jsonl`.
- They typed in the terminal (or the session is terminal-only): answer in the terminal as usual, and log both sides yourself (below).
- Site message kinds: `answer` is a pick (`q`, `opt`, maybe a `note`: an amendment, see [Statuses](#statuses)); `comment` points at an element (`selector`, `text`) in an option's mock; `chat` is free text; `choice` answers a choice (below). A `chat`, `comment` or typed `choice` may end with `Attached pictures`: `Read` each listed path before answering. A message whose `slug` isn't this session's: tell the user to run `/grill resume <slug>` in the terminal, never resume it yourself.
- If a tool says the session is disconnected (after `/clear`), call `attach` with the same slug again.

**Dialogs.** While attached, never open `AskUserQuestion`. Post the choice with `mcp__plugin_belay_belay__choice` (`prompt`, 2–8 button labels; unnumbered), and print the same prompt and options as plain text in the terminal, so either side can answer. The answer arrives as a `kind="choice"` message: by button (`option`) or as free text (`text`, the user dismissed the buttons and typed instead, like "Other"); a reply typed in the terminal answers it too. Terminal-only sessions use `AskUserQuestion` as before.

### Save after every resolved Q

A question is "resolved" when the user accepts your recommendation, gives a substantive answer that holds up, or explicitly defers. As soon as that happens:

1. In `session.json`, set the question's `status`, `pick` and `answer` (the digest: multi-line if needed; capture the decision *and* the reasoning when it matters, never a forced one-liner).
2. Update `open` to a one-line note describing the next question / current branch.
3. Update `updated` to today's date.
4. Render and log, in one Bash call:
   ```bash
   node "P/scripts/render-md.js" "S/<slug>" && node "P/scripts/log-chat.js" <slug> terminal <<'EOF'
   <what the user typed in the terminal, verbatim>
   EOF
   ```
   `render-md.js` prints `ok`, or the problems in `session.json` to fix (it writes nothing until it's valid). Never Read the scripts.

If no `session.json` exists yet (fresh start, first Q resolving), write it now (`S/<slug>/session.json`, shape in the format reference), with every question asked so far.

Add each question to `questions` when you ask it (`status: "open"`, `rec`, `opts`), in the same response as the message, so the site shows it while it's open. An unresolved question is saved, not decided: never set `pick` or `answer` in the response that recommends it.

**Logging terminal messages.** In the terminal, each turn appends what the user typed (`terminal`) and my message (`claude`) to `chat.jsonl`, so the site's conversation shows the whole session. Fold it into a Bash call the turn already makes (the save above, or a check): `node "P/scripts/log-chat.js" <slug> claude <<'EOF' … EOF` with my message's text. Messages sent with `reply` or `choice` are already logged by the bridge; don't log them again. Before the session folder exists (fresh path, first question), skip logging.

**Do not save while still proposing.** If you are recommending an answer to a question in this same response, the question is not resolved yet — wait for the user's next turn to confirm before writing its `pick` or `answer`. Phrases like "Saving with X" or "Locking in" in the same response as a recommendation are a red flag: you are pre-committing the user's answer. Save only after the user has had a turn to respond to the recommendation.

When a single response contains multiple sub-questions and the user resolves some but not others, save only the resolved sub-questions; leave the unresolved ones in `open`.

### Glossary writes

When a resolved Q&A defines or refines a domain-specific term, also update the project's `CONTEXT.md` inline (same response as the session save). The session captures the *grilling*; `CONTEXT.md` captures the *vocabulary*. The two are independent — write to both.

**Locating `CONTEXT.md`.** If a `CONTEXT-MAP.md` exists at the project root, follow it to the per-context `CONTEXT.md` (infer which context the term belongs to; ask if unclear). Otherwise expect a single `CONTEXT.md` at the project root.

**Lazy creation.** If no `CONTEXT.md` exists when the first domain term resolves in a session, ask once (a choice, see [Dialogs](#where-to-answer)) whether to create one. If the user declines, skip glossary writes silently for the rest of the session — do not ask again.

**Scope.** Only project-specific vocabulary — concepts unique to this codebase's domain. General programming concepts (timeouts, error types, utility patterns) don't belong even if used heavily. Format follows [`CONTEXT-FORMAT.md`](./CONTEXT-FORMAT.md) (sibling to this file).

**What stays out.** `CONTEXT.md` is a glossary only. No implementation details, no specs, no scratch-pad content. If a resolved Q is about *how* the system works rather than *what a term means*, it belongs in the session (and eventually the plan), not the glossary.

### Mocks

A mockup of the frontend changes being proposed, so the user can look at a design instead of reading a description of it. The site draws it from the session's files. A question qualifies when **any** of its options would look different: layout, a new screen or modal, copy and labels, a flow between screens, or a data decision that changes what some player sees (e.g. a card a signed-out player loses). Small corrections qualify too. Decisions that change nothing visible under any option never get a mock. There is no opt-in: every qualifying question gets one.

**Where.** In the session folder, beside `session.json`. It's permanent. Never in the scratchpad, never an Artifact, never a Claude Doc, never in the repo.

**Start from the templates.** At the first mock, copy [`P/preview/spec-template.js`](./preview/spec-template.js) → `preview.spec.js` and [`P/preview/mock-template.css`](./preview/mock-template.css) → `preview.mock.css`, then fill them in, and set the session's `mock` settings in `session.json`. The site provides everything around the mock: the question list, option selector, Before, Current design, Today, Desktop/Phone, Compare and the conversation. Never write any of that into the spec.

**Files.**
- `session.json`: the questions, options and their `patch`es, and each mocked question's `mock` fields (format reference). Questions and options never go in the spec.
- `preview.spec.js`: `CONTROLS`, `BASE`, `renderScreen` and `route`. A plain classic script, no build step, no framework. Prefix helpers (`mk`, `NAV_…`) to keep top-level names distinct.
- `preview.mock.css`: the tokens and any mock styles the app CSS doesn't cover. Loads inside the frames, after `preview.app.css`.
- `preview.app.css` (optional, `mock.appCss: true`): the app's real CSS, copied as-is (see Fidelity).
- `preview.data.js` (optional, `mock.data: true`): bulky real data (pixel art, seed records) as `window.X = …` globals. Make it with a shell or Node command that reads the app's source data; never type or paste bulky data.
- There is no `preview.html` and no version file: the site watches the folder and redraws on every change.
- **Mark each region a question changes** with a unique comment (`/* Q3:optB */`) or `data-id` in the spec, and use it as the Edit anchor.
- Edit the spec and `session.json` with Edit. Don't patch them through inject or string-replacement scripts: they break on shell quoting and hide what changed.
- **Keep edits cheap.** Every separate step re-reads the whole conversation, and everything printed stays in it. One message holds, in this order: the edits, then one Bash call running `node "P/preview/check-preview.js" "S/<slug>"` and the render/log commands. Never a step of their own. The check validates `session.json`, runs the spec and renders every view; it prints `ok`, or the errors and unknown class names to fix. Never Read the script. Use the shortest `old_string` that's unique. To find a spot, `grep -n` for its marker, then view only a narrow window (Read with offset/limit, ≤30 lines). Never dump wide ranges of the spec.
- **No screenshots.** Don't render, screenshot or headlessly open the mock. The user checks it visually.

**Opening the site.** The first time a session gets a mock, check the site: `curl -s -o /dev/null -w '%{http_code}' http://127.0.0.1:4747/`. If it answers, open `start "" "http://127.0.0.1:4747/s/<slug>"` (Git Bash; `open` on macOS, `xdg-open` on Linux) and print that URL once as a fallback. If it doesn't, say **"Run `belay serve` to see the mock"** and describe the design in prose until the user says it's up. Never open it again: the site follows along on its own.

**Telling the user.** On updates, don't print the URL. Just say which question changed and which option it opens on ("Added Q5, showing c, my recommendation"). In an attached session, call `mcp__plugin_belay_belay__show` with the question number (and option) whenever you ask a mocked question or add options to one, so the page follows.

**Fidelity.**
- **Link the app's real CSS as-is.** Mocks render in iframes, so the app's global rules can't touch the site's chrome: no wrapping, no stripping. Have the mock use the app's real class names, so components come out exact.
  - **Project manifests.** `P/projects/<key>.md` (key: the session's `project`, else the repo folder name) records the app root, the CSS source files in order (tokens first), for SCSS the compiled CSS path or its build command, `floor`, font links, and optionally the data source and the command that writes `preview.data.js`, plus one copy command. At the first mock, if the manifest exists, run its copy command into `preview.app.css` without reading the CSS. Otherwise write the manifest first. If its paths no longer exist, repair it.
  - Copy only at the first mock, never on resume, so Today stays fixed.
  - SCSS: use the compiled CSS. CSS Modules: copy the source files, not the compiled ones, so class names stay readable. Never purge unused CSS.
  - Where lifting isn't practical (Tailwind-heavy, CSS-in-JS), fall back to the project's design tokens (colours, fonts, radii, light/dark) plus hand-matching, and say so in the note. Invented look-alikes have had to be rebuilt more than once.
- Match the real app's wording.
- Use real data where it's cheap: titles, pictures, counts pulled from the code or seed data rather than placeholders.
- Mirror real components and their states (badges, empty states, breakpoints) from the code rather than inventing look-alikes.
- **Interactive where cheap.** The mock scrolls like the real screen, the real app's hover and focus states work, and its content actually changes with the selected option, so "what changed?" is visible. Costly interactions (menus opening, typing into forms, modals, drag-and-drop) stay as controls. Mirror the real app's behaviour; never invent interactions it doesn't have.

**What the site shows**, and the content must respect:
- **Current design**: every *decided* pick combined, never proposals. A part whose question is still open is drawn as it was before the session; on a brand-new page it's a grey `pv-undecided` block in its real spot, labelled `Qn · not decided yet`.
- **Today**: the page as it was *before* this session. It never changes. A brand-new page has none (`mock.page: "new"`).
- **Each mocked question**, in the order asked, with an option selector (Before first, then every option, opening on my rec while open and on the pick once resolved), the question's controls, Desktop/Phone, and the selected option's name and one-liner under it. Its `note` says **where to look in the mock and which control to flip**. **Before** is the region without this question's patch, so on a new page it's the grey block. Never add it to `opts`; it's never the rec or the pick.
- Frames are labelled with `route(d, ctx)`: the route *and the state shown* (`/play · paused`).
- Frames are `srcdoc` iframes, so the app's media queries, viewport units and fixed positioning see the frame. **Desktop** is `max(mock.floor, column)` wide, `floor` being the app's widest desktop breakpoint lifted from its CSS; below it, it's scaled down. **Height**: app shells that fill the window (editor, board, a sidebar layout) are one window tall and scroll inside (`screen: "shell"`); ordinary scrolling pages use their natural length (`"page"`). **Phone** is 390×844.

**Statuses.** A question is `open`, `resolved` (shown as `✓ picked`), `see` (`↪ see Qn`: none of these, or superseded by a follow-up), `deferred`, or `dropped`. Option flags: my rec (`rec`), the pick (`pick`), `yours` (the user's own idea or amendment), `current` (the old pick, shown in a follow-up for comparison), `out` (ruled out: stays in place, greyed and struck). When the user amends an option ("c, but grey", or a pick from the site with a `note`), add the amended version as a `yours` variant of it (`c1`, `"from": "c"`) and pick that, so the mock shows what was actually decided.

**Render from decisions.** `BASE` is the page as it is now; each option carries a `patch`. The order the site applies them in is in the format reference. `renderScreen` and `route` are pure: decisions and controls come in as arguments, never globals. Per-question needs go in the question's `mock` fields, which the site reads generically: `controls`, `starts`, `fixed`, `requires`, `screen`. A question that needs different drawing reads `ctx.q` inside `renderScreen`.

**Keep it current.** Add the question's `mock` and option patches when the question is asked, alongside the recommendation. When it resolves, its `pick` and `answer` (or `status`) are saved as usual; `render-md.js` ends the digest of a mocked question with `Previewed (Qn).`

### When to stop

There is no fixed checklist; you stop when **shared understanding is reached** — i.e., when you could confidently write a plan and you can't think of another blocking decision worth asking about. When you reach this point, say so explicitly and offer Phase 2.

The user can also stop you at any time with an exit phrase ("enough", "ship it", "just plan it", "stop grilling", or plain-English equivalent). On exit phrase, set `open` to `User stopped grilling.` and offer Phase 2.

## Phase 2 — Optional plan

Triggered when grilling ends (shared understanding reached or user exit phrase). Ask (a choice, see [Dialogs](#where-to-answer)) whether to write a plan now, save without a plan, or keep grilling.

If the user wants a plan:

1. Call `EnterPlanMode`.
2. Write the plan to the plan-file path given in plan mode's system message.
3. Prepend a [Bookkeeping section](#bookkeeping-section) to the plan.
4. Attached: send `reply` with "Plan ready: approve it in the terminal." and the plan file's path. Plan approval only works in the terminal.
5. Call `ExitPlanMode`. On rejection, the session stays `in-progress` and nothing needs undoing, so the user can resume to refine answers.

The user usually accepts with a context clear, so nothing after `ExitPlanMode` runs in this conversation. Every on-acceptance step therefore lives in the plan, and whichever session implements it runs them. Plan mode only allows edits to the plan file, so don't write them anywhere else first. Don't detach before `ExitPlanMode`; the bridge drops the attachment when the terminal closes or `/clear`s.

If the user wants to save without a plan: set `status` to `in-progress` (or `abandoned` if they say they're dropping it), render, call `mcp__plugin_belay_belay__detach` if attached, and exit with the slug and resume instructions (`/grill resume <slug>`).

### Bookkeeping section

While still in plan mode, if the session has a `project` and `belay` is installed, split the plan into discrete deliverables. Usually that means one per phase or milestone, not one per step. Confirm the titles and dependencies (a choice: use these / edit first / no issues). Then put this section at the very top of the plan, filled in:

````markdown
## Bookkeeping (do first, once)
From grill `<slug>`. Skip this section if that grill's `session.json` already says `"status": "planned"`.
1. In `C:\Users\Nick\Belay\grills\<slug>\session.json`, set `"status": "planned"` and `"updated": "<today>"`, then run `node "<P>\scripts\render-md.js" "C:\Users\Nick\Belay\grills\<slug>"` (it prints `ok`), then `belay grill commit <slug>`.
2. Create the belay issues in order, passing the IDs that earlier commands print (`added <id> …`) to `--blocked-by`:
   - `belay add "<title 1>" --project <key> --status todo --grill <slug> --plan "<plan file path>"`
   - `belay add "<title 2>" --project <key> --status todo --grill <slug> --plan "<plan file path>" --blocked-by <id of 1>`
3. Report the created IDs in one line.
````

Write `<P>` as the plugin root's absolute path. Without a project or `belay`, or if the user chose no issues, keep only step 1. Step 1 is the guard: implementing a later phase in a fresh session sees `planned` and skips the section.
