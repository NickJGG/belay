# IRIS — Iris (Firefox extension)

- **App root:** `C:\Users\Nick\Projects\Extensions\Firefox\iris`
- **CSS sources, in order:** `src/ui/iris.css` only. Tokens sit on `.iris-root` and read YouTube's `--yt-spec-*` variables; dark is `html[dark] .iris-root`. Mocks wrap content in `.iris-root` and define the `--yt-spec-*` variables per theme in `preview.mock.css` (as `feed.html` does).
- **Compiled CSS:** none (plain CSS, bundled as a string by `build.mjs`).
- **Floor:** `1284` — no media queries; `.iris-feed` caps at `max-width: 1284px`.
- **Fonts:** `https://fonts.googleapis.com/css2?family=Roboto:wght@400;500;700&display=swap`

**Copy command** (`OUT` is the session folder):

```bash
cat "C:/Users/Nick/Projects/Extensions/Firefox/iris/src/ui/iris.css" > "$OUT/preview.app.css"
```
