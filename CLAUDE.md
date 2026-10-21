# CLAUDE.md

Pixels (working title): ~100 pixels bounce around a grid; the player taps cells to place/remove blocks and wins once every pixel is sealed into at most `WIN_AREA_PERCENT` (15%) of the board's open cells. Placing a block on a pixel traps it (it shakes) until the block is removed, and you can't win while any pixel is trapped. Score = moves × seconds, lower is better. A daily board (seeded by local date) plus a practice mode (`#practice`).

Plain Vite + TypeScript, canvas rendering, no framework, no server. Built with `base: "/pixels/"` and deployed to GitHub Pages by `.github/workflows/deploy.yml`; thorstein-games-website proxies `thorsteingames.com/pixels` to it.

## Commands

```bash
npm run dev          # Vite dev server
npm run verify       # typecheck + unit tests — run before committing
npx playwright test  # e2e against a production build (desktop + phone viewports)
npx vite-node scripts/balance.ts [seeds] ['{"roomMaxCells":14}']  # bot playtest: median time/moves to reach each area threshold
node scripts/logo.mjs && npx vite-node scripts/render-images.ts  # regenerate logo SVGs, then app icons + share image
```

## Layout

- `src/game/config.ts` — every difficulty knob (grid size, pixel count/speed, spawn clusters, win ratio, room size). Tune here, and check changes with `scripts/balance.ts`: a bot tapping at human pace. Small rooms make doorways do the work; below ~15% the endgame turns into waiting for empty cells in crowded rooms, and time roughly triples. Changing generation or tuning changes that day's daily board for anyone who hasn't solved it yet.
- `src/game/level.ts` — `generateLevel(seed)`: recursive-division rooms with doorways, unreachable pockets sealed, pixels spawned in clusters. `floodFill` is shared with the sim.
- `src/game/sim.ts` — pure game state: fixed-timestep physics (`advance`/`step`, axis-separated bounces so pixels stay in 4-connected regions), `tap`, `measure` (reachable area; only changes on a tap, so the win check runs there).
- `src/daily.ts` — date keys, seed, streak math, localStorage (`pixels.daily.*`). Daily progress (clock + moves) survives reloads and restarts; the board itself resets.
- `src/main.ts` — DOM/UI wiring and the rAF loop; `src/render.ts` — canvas drawing and animations. Blocks are placed on pointer *up* (press shows an aim highlight, drag moves it, releasing off the board cancels); the canvas eats `touchstart` and the page uses `touch-action: manipulation` so iOS doesn't double-tap zoom. The board is sized by a `ResizeObserver` on `#board-wrap`, and `.app`'s max-width grows with screen height so tablets fill up.
- Shared Thorstein Games chrome: `index.html` loads `https://thorsteingames.com/tg-bar.js` (from the thorstein-games-website repo, whose CLAUDE.md has the full contract) and uses `<tg-bar game="pixels">` (thin site header, hides on scroll down), `<tg-footer game="pixels">` (after `.app`, so it starts below the fold) and `<tg-more-games game="pixels">` ("Play a different game", in the win card). The bar is always 40px: `style.css` holds that space before the script loads and `.app` is `100dvh - 40px`, so keep both in step if the board's height maths changes. The e2e spec stubs the script so tests don't depend on production.
- Ads (`<tg-ad>`, rules and options in the hub's CLAUDE.md): a `rail` beside `.app` on wide screens, a `box` under the win card (`#win-overlay` stacks card and ad and scrolls from the top, so neither is cut off) and a `banner` between `.app` and the footer. Never on the board or during play. Check placements with `?tgads=preview`.
- Branding: `scripts/logo.mjs` generates `public/favicon.svg` (the mark: blocks penning in pixels, one escaping), `wordmark.svg` and `logo.svg` (header) from its `NAME` constant and a 5×7 pixel font; `scripts/render-images.ts` renders the PNG icons and `og-image.png` (a real board drawn by `render.ts`). Bump the `?v=` on the og:image URLs when the share image changes so link previews refetch it. thorstein-games-website's `public/pixels.svg` is a copy of the favicon for its homepage card.
- `window.__pixels` exposes UI state so e2e tests can steer pixels instead of chasing them.

Determinism: the daily board and pixel paths must match on every device, so level generation avoids `Math.sin`/`cos` (only `sqrt`) and the sim always steps by `STEP_SECONDS`.
