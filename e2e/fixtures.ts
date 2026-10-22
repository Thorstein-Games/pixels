/**
 * Shared setup for every spec: the Thorstein Games bar script is stubbed
 * (tests never hit production; its 40px placeholder keeps the layout), and
 * any page error or console error fails the test.
 */
import { test as base, expect, type Page } from "@playwright/test";

export const test = base.extend<{ consoleErrors: string[] }>({
  consoleErrors: [
    async ({ page }, use) => {
      await page.route("https://thorsteingames.com/tg-bar.js", (r) =>
        r.fulfill({ contentType: "text/javascript", body: "" }),
      );
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(e.message));
      page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
      await use(errors);
      expect(errors).toEqual([]);
    },
    { auto: true },
  ],
});

export { expect, type Page };

/** The game's state, exposed as window.__pixels. */
export const state = (page: Page) => page.evaluate(() => (window as any).__pixels);

/** Taps the centre of a board cell. */
export async function tapCell(page: Page, c: number, r: number) {
  const cell = await page.evaluate(() => (window as any).__pixels.cell);
  const box = (await page.locator("#board").boundingBox())!;
  const border = (box.width - 14 * cell) / 2;
  await page.mouse.click(box.x + border + (c + 0.5) * cell, box.y + border + (r + 0.5) * cell);
}

/** First empty cell no pixie is in right now. */
export async function freeCell(page: Page): Promise<[number, number]> {
  return page.evaluate(() => {
    const { game } = (window as any).__pixels;
    const taken = new Set(game.pixels.map((p: any) => Math.floor(p.y) * game.cols + Math.floor(p.x)));
    for (let i = 0; i < game.cells.length; i++) {
      if (game.cells[i] === 0 && !taken.has(i)) return [i % game.cols, Math.floor(i / game.cols)];
    }
    throw new Error("no free cell");
  });
}

/** Stops every pixie where it is, so taps land where the test expects. */
export async function freezePixies(page: Page) {
  await page.evaluate(() => {
    for (const p of (window as any).__pixels.game.pixels) Object.assign(p, { vx: 0, vy: 0 });
  });
}

/** Clears the board and gathers every pixie in the top-left cell. */
export async function gatherInCorner(page: Page) {
  await page.evaluate(() => {
    const { game } = (window as any).__pixels;
    game.cells.fill(0);
    for (const p of game.pixels) Object.assign(p, { x: 0.5, y: 0.5, vx: 0, vy: 0 });
  });
}

/** Wins the current board through real taps: pixies in a corner, two blocks to seal it. */
export async function winNow(page: Page) {
  await gatherInCorner(page);
  await tapCell(page, 1, 0);
  await tapCell(page, 0, 1);
  await expect(page.locator("#win-overlay")).toBeVisible();
}

export async function start(page: Page) {
  await page.getByRole("button", { name: /^(Start|Continue)$/ }).click();
}
