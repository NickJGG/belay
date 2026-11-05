# Answer format: Excalidraw diagrams

A `work/*.excalidraw` file is a boxes-and-arrows diagram the learner draws in the Work tab's canvas. Read this when setting a task that wants a diagram, writing a starter, or marking one.

## When to ask for one

Ask for a diagram when the answer is a structure: components and how they connect (a system design, a data flow, a pipeline, a dependency graph). Prose or Mermaid stays right for an argument, a sequence of steps or a single formula.

Name the file in the task: `work/<topic>.excalidraw` (kebab-case, e.g. `work/news-feed.excalidraw`), or `work/<topic>-<n>.excalidraw` for a second attempt. The learner makes it with + New → Diagram, or you write a starter (below).

## Reading it

Never Read the `.excalidraw` file: it is JSON with coordinates and styling, and guessing structure from it is how a drawing gets misread. Read only its summary:

- **Sent from the site:** the attempt message carries the summary under the "submitted" line. Use it as is.
- **Otherwise** (the message says it was too long, or the learner says "look at my diagram"): `belay work read "<absolute path>"`.

The summary states only what the file records, by id:

```
work/news-feed.excalidraw · 18 elements: 5 boxes, 4 arrows, 7 labels, 1 note, 1 unreadable · 1 unattached, 1 loose, 1 unreadable
Boxes:
  Client
  API
  Cache (ellipse)
  DB (diamond)
  Fan-out
Arrows:
  Client → API "POST /tweet"
  API → Cache "reads"
  API ↔ DB
  Fan-out → ?  (end unattached; nearest box: Cache, 14px)
Notes:
  "shard by user id"
Unreadable:
  freedraw (nearest box: DB, 40px)
```

- Boxes are named by their text; a shape other than a rectangle is noted. `box N (no label)` is a box with no text, `Cache #2` a second box with the same label.
- Arrows: `→` one head, `↔` both, `—` none. The quoted part is the arrow's own label.
- `?` is an arrow end not attached to any box. The nearest box and distance are a measurement, not a guess at intent: never read `Fan-out → ?` as `Fan-out → Cache`.
- **Notes** are free text; `(over A, B)` means it overlaps those boxes, but isn't attached to them.
- **Unreadable** is freehand, images and lines: the summary can't say what they mean.
- **Frames** (when present) group boxes: `Backend: API, Cache, API → Cache`.

`?` ends, loose notes and unreadable lines are the learner's to fix. Say what the summary shows ("the arrow from Fan-out isn't attached to anything") and ask them to attach or label it; don't mark the diagram as if it said what they probably meant.

## Writing starters and flawed designs

`belay work write "<absolute path>"` takes a spec on stdin in the summary's grammar and lays it out. It refuses an existing file unless given `--force`. Never use `--force` on the learner's file: write a new one.

```
belay work write "C:/Users/Nick/Learning/system-design/work/feed-starter.excalidraw" <<'EOF'
Boxes:
  Queue (ellipse)
Arrows:
  Client -> API "POST /tweet"
  API -> Queue
  Queue <-> Worker
Notes:
  "where does the timeline get read from?"
EOF
```

- `Boxes:` is optional; boxes named only in arrows are rectangles. A suffix `(ellipse)` or `(diamond)` sets the shape.
- Arrows: `->`/`→`, `<->`/`↔`, `<-`/`←`, `--`/`—`, then an optional `"label"`.
- `Notes:` lines land under the diagram, loose.
- No `?` ends, frames or unreadable lines: every arrow joins two boxes.

Use it for a starter the learner extends, or for a flawed design they must critique (a single DB with no cache, a cycle). `belay work read` on the result shows exactly what they'll see.

## Marking

Mark the topology and the labels, never the layout:
- **Components:** the boxes the design needs are there, and each is named for what it does.
- **Connections:** the arrows join the right boxes, in the right direction. A missing or reversed arrow is a gap; a `?` end counts as missing.
- **Labels:** where the rubric asks (protocol, data, read or write), the arrow or a note says it.

Position, size, colour and style don't count. Cite the claim a gap misses, as for any answer.
