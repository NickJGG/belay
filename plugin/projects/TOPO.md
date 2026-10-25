# TOPO — Topo

- **App root:** `C:\Users\Nick\Projects\Websites\topo`
- **CSS sources, in order** (plain CSS + CSS Modules; copy the module sources):
  1. `src/app/globals.css` — tokens + reset. Dark is bare `:root`; light is `:root.light` (next-themes), rewritten to `:root[data-theme="light"]` for the frames.
  2. `src/**/*.module.css` — module class names collide across files (`.main`, `.card`, `.body`…), so each file's classes are prefixed with its basename: `.bar` in `toolbar.module.css` becomes `.toolbar__bar`. Mocks use the prefixed names.
- **Compiled CSS:** none (no SCSS).
- **Floor:** `1200` — the widest breakpoint is `@media (min-width: 1200px)`; the dock breakpoint is 768.
- **Fonts:** `https://fonts.googleapis.com/css2?family=Inter:wght@400..700&family=Inter+Tight:wght@500..800&family=JetBrains+Mono:wght@400;500&display=swap` (next/font sets `--font-inter`, `--font-inter-tight`, `--font-jetbrains-mono`; define them in the mock CSS).
- **Real data:** courses live in `C:\Users\Nick\Learning\<course>\` (`syllabus.md`, `course.md`, `knowledge/`).

**Copy command** (`OUT` is the session folder):

```bash
cd "C:/Users/Nick/Projects/Websites/topo" && { sed 's/:root\.light/:root[data-theme="light"]/' src/app/globals.css; for f in $(find src -name '*.module.css' | sort); do p=$(basename "$f" .module.css); sed -E "s/\.([a-zA-Z][a-zA-Z0-9_-]*)/.${p}__\1/g" "$f"; done; } > "$OUT/preview.app.css"
```
