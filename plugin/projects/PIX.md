# PIX — Pixel Imperium

- **App root:** `C:\Users\Nick\Projects\Websites\pixel-imperium\apps\web`
- **CSS sources, in order** (plain CSS + CSS Modules; copy the module sources):
  1. `src/styles/tokens.css` — tokens. Night on bare `:root`, Day on `[data-theme='light']` and the light system preference.
  2. `src/global.css` — drop its `@import './styles/tokens.css'` line; tokens are already in.
  3. `src/**/*.css` that aren't modules (`menu-step.css`, the Worlds morph files).
  4. `src/**/*.module.css`.
- **Compiled CSS:** none (no SCSS).
- **Floor:** `861` — the widest breakpoint is `@media (max-width: 860px)`.
- **Fonts:** `https://fonts.googleapis.com/css2?family=Fredoka:wght@400..700&family=Rubik+Mono+One&family=Space+Mono:wght@400;700&display=swap`

**Copy command** (`OUT` is the session folder):

```bash
cd "C:/Users/Nick/Projects/Websites/pixel-imperium/apps/web" && { cat src/styles/tokens.css; grep -v "^@import" src/global.css; find src -name '*.css' ! -name '*.module.css' ! -path src/global.css ! -path src/styles/tokens.css | sort | xargs cat; find src -name '*.module.css' | sort | xargs cat; } > "$OUT/preview.app.css"
```
