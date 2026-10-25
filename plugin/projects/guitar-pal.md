# guitar-pal — Guitar Pal

- **App root:** `C:\Users\Nick\Projects\Websites\guitar-pal`
- **CSS sources, in order** (plain CSS + CSS Modules; copy the module sources):
  1. `src/app/globals.css` — tokens + reset. Dark on bare `:root`, light on `:root.light` (next-themes class). The mock CSS mirrors the light tokens under `:root[data-theme="light"]`.
  2. `src/**/*.module.css` — each wrapped in a native-CSS-nesting scope `.m-<basename-without-.module.css> { … }` because many modules share class names (`.card`, `.header`, `.root`). In mocks, wrap a component's markup in `<div class="m-site-nav">` etc. `@keyframes` inside modules are lost by the wrap (cosmetic only).
- **Compiled CSS:** none (no SCSS, no Tailwind).
- **Floor:** `1200` — widest breakpoint is `@media (min-width: 1200px)`.
- **Fonts:** `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@500;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap` (app uses next/font vars `--font-inter`, `--font-inter-tight`, `--font-jetbrains-mono`; mock CSS sets them).

**Copy command** (`OUT` is the session folder):

```bash
cd "C:/Users/Nick/Projects/Websites/guitar-pal" && { cat src/app/globals.css; find src -name '*.module.css' | sort | while read f; do n=$(basename "$f" .module.css); echo ".m-$n {"; cat "$f"; echo "}"; done; } > "$OUT/preview.app.css"
```

**Collision note:** several routes share `page.module.css` / `layout.module.css`, so `.m-page` / `.m-layout` mix rules from all of them. For a specific route, append that file again under its own wrapper (e.g. `echo ".m-play {"; cat "src/app/(app)/page.module.css"; echo "}"` → `.m-play`, and `(app)/layout.module.css` → `.m-applayout`).
