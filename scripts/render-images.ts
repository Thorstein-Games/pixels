/**
 * Renders the PNGs derived from the logo (run `node scripts/logo.mjs` first):
 * app icons and the 1200×630 share image, whose board is a real generated
 * level drawn by the game's own renderer.
 *
 *   npx vite-node scripts/render-images.ts
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import { EMPTY, generateLevel } from "../src/game/level";
import { advance, createGame, tap } from "../src/game/sim";
import { WIN_AREA_PERCENT, PIXEL_COUNT } from "../src/game/config";

const pub = (f: string) => fileURLToPath(new URL(`../public/${f}`, import.meta.url));
const svg = (f: string) => `data:image/svg+xml;base64,${readFileSync(pub(f)).toString("base64")}`;
const BG = "#0d0f16";

// A board a few seconds in: pixels spreading from their clusters and some
// blocks placed against the walls.
const game = createGame(generateLevel(20261021));
advance(game, 1.6);
const busy = new Set(game.pixels.map((p) => Math.floor(p.y) * game.cols + Math.floor(p.x)));
let placed = 0;
for (let i = 0; i < game.cells.length && placed < 14; i += 5) {
  const c = i % game.cols;
  const r = Math.floor(i / game.cols);
  const solidAround = [
    [c - 1, r], [c + 1, r], [c, r - 1], [c, r + 1],
  ].filter(([x, y]) => x < 0 || y < 0 || x >= game.cols || y >= game.rows || game.cells[y * game.cols + x] !== EMPTY).length;
  if (game.cells[i] === EMPTY && !busy.has(i) && solidAround >= 2) {
    tap(game, c, r);
    placed++;
  }
}
advance(game, 0.4);

// The page draws it with src/render.ts, bundled on the fly.
const { outputFiles } = await build({
  stdin: {
    contents: `import { draw, createAnim } from "./src/render.ts";
      window.paint = (canvas, g, cell) => {
        const ctx = canvas.getContext("2d");
        ctx.setTransform(2, 0, 0, 2, 0, 0);
        g.cells = Uint8Array.from(g.cells);
        g.reachable = Uint8Array.from(g.reachable);
        draw(ctx, g, cell, 1000, createAnim(), null);
      };`,
    resolveDir: fileURLToPath(new URL("..", import.meta.url)),
    loader: "ts",
  },
  bundle: true,
  write: false,
  format: "iife",
});
const paint = outputFiles[0].text;
const state = JSON.stringify({ ...game, cells: [...game.cells], reachable: [...game.reachable] });

const browser = await chromium.launch();

for (const [file, size] of [["apple-touch-icon.png", 180], ["icon-192.png", 192], ["icon-512.png", 512]] as const) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(`<body style="margin:0;background:${BG}"><img src="${svg("favicon.svg")}" width="${size}" height="${size}" style="display:block"></body>`);
  await page.screenshot({ path: pub(file) });
  await page.close();
}

const cell = 27;
const page = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await page.setContent(`<body style="margin:0;width:1200px;height:630px;overflow:hidden;display:flex;align-items:center;
  background:radial-gradient(circle at 72% 50%,#1d2338,${BG} 70%);font-family:ui-monospace,'DejaVu Sans Mono',monospace;color:#e8eaf3">
  <div style="flex:1;padding-left:76px">
    <img src="${svg("logo.svg")}" style="height:128px;display:block;margin-left:-6px">
    <div style="font-size:40px;margin-top:34px;line-height:1.3">Trap ${PIXEL_COUNT} bouncing pixels<br>in ${WIN_AREA_PERCENT}% of the board.</div>
    <div style="font-size:26px;margin-top:26px;color:#f5b83d">A new puzzle every day</div>
    <div style="font-size:22px;margin-top:34px;color:#8a90a8">thorsteingames.com/pix-pen</div>
  </div>
  <canvas id="c" width="${game.cols * cell * 2}" height="${game.rows * cell * 2}"
    style="width:${game.cols * cell}px;height:${game.rows * cell}px;margin-right:64px;border:2px solid #4c5378;border-radius:6px;box-shadow:0 0 60px rgba(0,0,0,.6)"></canvas>
  <script>${paint}</script>
  <script>paint(document.getElementById("c"), ${state}, ${cell});</script>
</body>`);
await page.screenshot({ path: pub("og-image.png") });
await browser.close();
console.log("wrote apple-touch-icon.png, icon-192.png, icon-512.png, og-image.png");
