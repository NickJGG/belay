# BEL — Belay

- **App root:** `C:\Users\Nick\Projects\Tools\belay\web`
- **CSS sources, in order** (plain CSS + CSS Modules; copy the module sources):
  1. `src/app/globals.css` — tokens + reset. Dark is bare `:root`; light is `:root.light` (next-themes), rewritten to `:root[data-theme="light"]` for the frames.
  2. `src/**/*.module.css` and `../extensions/*/web/**/*.module.css` — module class names collide across files (`.card`, `.body`…), so each file's classes are prefixed with its basename: `.drawer` in `session.module.css` becomes `.session__drawer`. Mocks use the prefixed names.
- **Compiled CSS:** none (no SCSS).
- **Floor:** `768` — every breakpoint is `@media (min-width: 768px)` / `(max-width: 767px)`.
- **Fonts:** `https://fonts.googleapis.com/css2?family=Inter:wght@400..700&family=Inter+Tight:wght@500..800&family=JetBrains+Mono:wght@400;500&display=swap` (next/font sets `--font-inter`, `--font-inter-tight`, `--font-jetbrains-mono`; define them in the mock CSS).
- **Real data:** issues, projects and logs in `C:\Users\Nick\Belay\`; courses in `C:\Users\Nick\Learning\<course>\` (`syllabus.md`, `course.md`, `knowledge/`).

**Copy command** (`OUT` is the session folder):

```bash
cd "C:/Users/Nick/Projects/Tools/belay/web" && { sed 's/:root\.light/:root[data-theme="light"]/' src/app/globals.css; for f in $(find src ../extensions/*/web -name '*.module.css' | sort); do p=$(basename "$f" .module.css); sed -E "s/\.([a-zA-Z][a-zA-Z0-9_-]*)/.${p}__\1/g" "$f"; done; } > "$OUT/preview.app.css"
```
