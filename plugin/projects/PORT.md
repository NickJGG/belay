# PORT — Portfolio

- **App root:** `C:\Users\Nick\Projects\Websites\portfolio`
- **CSS sources, in order** (plain CSS + CSS Modules; copy the module sources):
  1. `src/app/globals.css` — tokens + reset. Dark is bare `:root`, light is `.light` on <html> (mock CSS must map `[data-theme="light"]` to the light tokens). `data-section="<section>"` maps a Section color onto `--accent`.
  2. `src/**/*.module.css` — each wrapped in `.m-<basename-without-.module.css> { … }` (native CSS nesting), since `page.module.css` repeats across routes. In mocks wrap markup in `<div class="m-Tile">` etc.
- **Compiled CSS:** none (no SCSS, no Tailwind).
- **Floor:** `1200` — widest breakpoint is `@media (min-width: 1200px)` (SiteShell, ReadingLayout).
- **Fonts:** `https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Inter+Tight:wght@500;600;700&family=JetBrains+Mono:wght@400;500;700&display=swap` (app uses next/font vars `--font-inter`, `--font-inter-tight`, `--font-jetbrains-mono`; mock CSS sets them).
- **Images:** reference real assets as `file:///C:/Users/Nick/Projects/Websites/portfolio/public/...`.

**Copy command** (`OUT` is the session folder):

```bash
cd "C:/Users/Nick/Projects/Websites/portfolio" && { cat src/app/globals.css; find src -name '*.module.css' | sort | while read f; do n=$(basename "$f" .module.css); echo ".m-$n {"; cat "$f"; echo "}"; done; echo ".m-home {"; cat "src/app/(site)/(home)/page.module.css"; echo "}"; echo ".m-projectpage {"; cat "src/app/(site)/projects/[slug]/page.module.css"; echo "}"; echo ".m-projects {"; cat "src/app/(site)/projects/(index)/page.module.css"; echo "}"; echo ".m-about {"; cat "src/app/(site)/about/page.module.css"; echo "}"; echo ".m-experiments {"; cat "src/app/(site)/experiments/page.module.css"; echo "}"; } > "$OUT/preview.app.css"
```

**Collision note:** route `page.module.css` files all land in `.m-page`; the copy command appends home as `.m-home`, project detail as `.m-projectpage`, projects index as `.m-projects`, about as `.m-about`, experiments index as `.m-experiments`.
