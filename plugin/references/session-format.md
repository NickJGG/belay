# Session folder format

One folder per grill: `C:\Users\Nick\Belay\grills\<slug>\` (`BELAY_DATA` moves the root). A folder with only `<slug>.md` is a legacy grill, read-only.

| File | Written by | What |
|---|---|---|
| `session.json` | the skill (Edit/Write) | The source of truth: the session, its questions and options. |
| `<slug>.md` | `render-md.js` | Rendered from `session.json` after every save, in grill's markdown format, so belay keeps reading it. Never edit it by hand. |
| `chat.jsonl` | the bridge and `log-chat.js` | Every message from both sides, one JSON object per line. |
| `images/` | the site | Pictures attached to drawer messages, named `<UTC stamp>-<6 hex>.<ext>`; a message's `images` lists names in it. Kept with the session. |
| `bridge.json` | the bridge | `{port, token, sessionId, pid, at}` while a terminal is attached. Never touch it. |
| `preview.spec.js`, `preview.mock.css`, `preview.app.css`, `preview.data.js` | the skill | The mocks (see SKILL.md, Mocks). Only once the session has one. |

## session.json

```json
{
  "slug": "notes-sidebar",
  "topic": "One-line topic",
  "about": "The topic expanded, if needed (the .md's ## Topic).",
  "status": "in-progress",
  "project": "BEL",
  "started": "2026-10-23",
  "updated": "2026-10-23",
  "open": "One line: the next question or current branch, for whoever picks this up.",
  "mock": null,
  "questions": []
}
```

- `status`: `in-progress` | `planned` | `abandoned`.
- `project`: belay project key; leave the field out when there is none.
- `about`: optional; the `.md` falls back to `topic`.
- `mock`: `null` until the first mock, then the page-wide settings:
  ```json
  { "page": "existing", "floor": 1280, "screen": "page", "currentControls": ["auth"],
    "appCss": true, "data": false, "fonts": [] }
  ```
  `page`: `existing` (gets a Today view) or `new` (none). `floor`: the app's widest desktop breakpoint, from its
  CSS. `screen`: default mock height, `shell` (fills the window, scrolls inside) or `page` (natural length).
  `currentControls`: the controls Current design and Today offer. `appCss` / `data`: whether `preview.app.css`
  / `preview.data.js` exist. `fonts`: stylesheet URLs the frames load.

### Questions

Append in the order asked; `n` is the session's number and never changes.

```json
{
  "n": 3,
  "title": "Where do a card's actions sit?",
  "short": "Card actions",
  "status": "open",
  "rec": "b",
  "pick": null,
  "answer": null,
  "note": "Look at any card's bottom edge. Flip <b>Player</b> to see that signed-out players get none.",
  "opts": [
    { "key": "a", "name": "None", "expl": "Actions stay on the story page.", "patch": { "actions": "none" } },
    { "key": "b", "name": "Under the title", "expl": "Rename, share and trash sit under each title.", "patch": { "actions": "row" } }
  ],
  "mock": { "controls": ["auth"] }
}
```

- `title`: the question as asked. `short`: the label in the site's question list (≤4 words).
- `status`: `open` | `resolved` | `deferred` | `dropped` | `see`. `see` means none of these, or superseded by a
  follow-up: set `"see": <n>` as well.
- `rec`: my recommendation's key (or `null` for a question without options). `pick`: the user's key once
  resolved, else `null`.
- `answer`: the digest of the resolution, in the user's terms. It becomes the `.md`'s `**A:**` line. It may be
  multi-line: capture the decision and the reasoning when the reasoning matters, never a forced one-liner.
  For an option question, start with the pick (`b. …`).
- `note`: optional, mocked questions only: what's being decided, where to look in the mock, which control to flip.
- `opts`: in display order; omit (or `[]`) for an open-ended question.
  - `key`: `a`, `b`, …; variants are parent + number (`d1`, `d2`; a later round on `d2` is `d5`).
  - `name`: the short name, without the key. `expl`: the one-liner.
  - `from`: the key a variant iterates on. `yours: true`: the user's idea or amendment. `current: true`: the old
    pick, shown in a follow-up for comparison. `out: true`: ruled out (kept in place, greyed and struck).
  - `patch`: mocked questions only: the decision values this option sets, merged over `BASE`.
- `mock`: `null`/absent for a question with no mock. Otherwise `{controls, starts, fixed, requires, screen}`, all
  optional: `controls` lists `CONTROLS` keys its bar shows; `starts` sets their initial values (the user can
  change them); `fixed` pins context with no control; `requires` is the decision values it assumes from earlier
  picks; `screen` overrides `mock.screen`.

### Rendering a mock

`renderScreen(d, ctx)` in `preview.spec.js` gets:
- `d`, decisions, built in this order:
  - **Today:** `BASE`.
  - **Current design:** `BASE`, then the `patch` of every resolved question's `pick`, in question order.
  - **A question's option:** `BASE`, then every *other* resolved pick, then its `requires`, then the option's
    `patch`. **Before** stops short of the option's patch.
- `ctx`: every control's `def`, overlaid with the question's `starts`, the user's control choices and the
  question's `fixed`; plus `phone` (boolean) and `q` (the question number, or `null` on Current design and Today).

## chat.jsonl

One object per line, `{at, from, kind, …}`, `at` an ISO timestamp:

| `from` | `kind` | Fields | Written by |
|---|---|---|---|
| `site` | `chat` | `text`, `images?` (`text` may be empty when `images` isn't) | bridge |
| `site` | `answer` | `q, opt, note?` | bridge |
| `site` | `comment` | `q, opt, selector, text, note, images?` | bridge |
| `site` | `choice` | `id, option` or `id, text, images?` | bridge |
| `site` | `permission` | `request_id, behavior` | bridge |
| `site` | `attempt` | `path, text?` (lessons: a `work/` file handed in) | bridge |
| `site` | `restart` | `label, wrap?` (lessons: a start button asking for a fresh session) | bridge |
| `claude` | `reply` | `text` (sent to the site) | bridge |
| `claude` | `choice` | `id, prompt, options` | bridge |
| `claude` | `permission` | `request_id, tool_name, description, input_preview, mode?` (`mode` the permission mode the bridge last read from the transcript) | bridge |
| `claude` | `steps` | `start, steps: [{label, at, verb?, target?, detail?, id?, meta?, tone?}], ms, interrupted?` (`verb` plain, `target` a chip, `detail` after it; `label` joins them; `id` the tool call, `meta` a reason, duration or count after the row, `tone` `bad` or `warn`) (one per turn with steps, at its end) | bridge |
| `terminal` | `chat` | `text` (the user, typing in the terminal) | `log-chat.js` |
| `claude` | `terminal` | `text` (my message in the terminal) | `log-chat.js` |

## Lessons

A `/learn` routine attached by course (`attach({course, topic})`) gets a folder `C:\Users\Nick\Belay\lessons\lesson-<course>-<yyyymmdd>-<hhmm>\`, made up by the bridge, with `bridge.json`, `chat.jsonl` and a `session.json` the bridge writes itself: `{kind: "lesson", course, topic, status, started, updated}`, `status` `in-progress` until `detach` sets `done`. The site lists lessons only as live Tabs: grill lists skip `kind: "lesson"`.
