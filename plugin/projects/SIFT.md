# SIFT — Sift for Twitch

- **App root:** `C:\Users\Nick\Projects\Extensions\Firefox\sift`
- **CSS sources, in order:** `src/reader/reader.css` only. It's a shadow-root stylesheet: its tokens sit on `:host`, which doesn't match in a preview frame, so `preview.mock.css` re-declares them on `.host` (Twitch's own palette, dark and light). Everything around the reader (Twitch's header, list, message box) is hand-matched in the mock CSS.
- **Compiled CSS:** none.
- **Floor:** `340` — no breakpoints; the reader lives in Twitch's ~340px chat column, which the mock draws centred.
- **Fonts:** `https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&display=swap` (stand-in for Roobert/Inter).

**Copy command** (`OUT` is the session folder):

```bash
cat "C:/Users/Nick/Projects/Extensions/Firefox/sift/src/reader/reader.css" > "$OUT/preview.app.css"
```
