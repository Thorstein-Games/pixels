import { expect, test, type Page } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => m.type() === "error" && errors.push(m.text()));
  (page as Page & { errors?: string[] }).errors = errors;
});

test.afterEach(async ({ page }) => {
  expect((page as Page & { errors?: string[] }).errors).toEqual([]);
});

/** Taps the centre of a board cell. */
async function tapCell(page: Page, c: number, r: number) {
  const cell = await page.evaluate(() => (window as any).__pixels.cell);
  const box = (await page.locator("#board").boundingBox())!;
  await page.mouse.click(box.x + 2 + (c + 0.5) * cell, box.y + 2 + (r + 0.5) * cell);
}

/** First empty cell no pixel is in right now. */
async function freeCell(page: Page): Promise<[number, number]> {
  return page.evaluate(() => {
    const { game } = (window as any).__pixels;
    const taken = new Set(game.pixels.map((p: any) => Math.floor(p.y) * game.cols + Math.floor(p.x)));
    for (let i = 0; i < game.cells.length; i++) {
      if (game.cells[i] === 0 && !taken.has(i)) return [i % game.cols, Math.floor(i / game.cols)];
    }
    throw new Error("no free cell");
  });
}

test("daily: place, remove, and the clock and moves survive a reload", async ({ page }) => {
  await page.goto("./");
  await expect(page.locator("#start-kicker")).toHaveText(/Daily #\d+/);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await page.waitForTimeout(1200);
  const [c, r] = await freeCell(page);
  await tapCell(page, c, r);
  await tapCell(page, c, r);
  await expect(page.locator("#moves")).toHaveText("2");
  await expect(page.locator("#time")).toHaveText("0:01");
  await page.reload();
  await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
  await expect(page.locator("#moves")).toHaveText("2");
  await expect(page.locator("#time")).toHaveText("0:01");
});

test("a block on a pixel traps it until removed", async ({ page }) => {
  await page.goto("./#practice");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  // Freeze pixel 0 so the tap lands on it.
  const [c, r] = await page.evaluate(() => {
    const { game } = (window as any).__pixels;
    const p = game.pixels[0];
    Object.assign(p, { vx: 0, vy: 0 });
    return [Math.floor(p.x), Math.floor(p.y)];
  });
  await tapCell(page, c, r);
  await expect(page.locator("#stuck-note")).toBeVisible();
  await tapCell(page, c, r);
  await expect(page.locator("#stuck-note")).toBeHidden();
});

test("daily: winning shows the result, saves it and offers a share", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("./");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  // Gather every pixel into the top-left corner, then wall it in by tapping.
  await page.evaluate(() => {
    const { game } = (window as any).__pixels;
    game.cells.fill(0);
    for (const p of game.pixels) Object.assign(p, { x: 0.5, y: 0.5, vx: 0, vy: 0 });
  });
  await tapCell(page, 1, 0);
  await tapCell(page, 0, 1);
  await expect(page.locator("#win-overlay")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Caught 'em!" })).toBeVisible();
  await expect(page.locator("#win-moves")).toHaveText("2");
  await page.reload();
  await expect(page.locator("#win-overlay")).toBeVisible();
  await expect(page.locator("#win-extra")).toContainText("Streak 1");
  await expect(page.locator("#restart-btn")).toBeHidden();
});

test("serves the share image, icons, manifest and sitemap", async ({ page, request }) => {
  await page.goto("./");
  await expect(page.locator('meta[property="og:image"]')).toHaveAttribute("content", /og-image\.png\?v=2$/);
  for (const path of ["og-image.png", "apple-touch-icon.png", "icon-192.png", "icon-512.png", "manifest.webmanifest", "sitemap.xml"]) {
    expect((await request.get(path)).status(), path).toBe(200);
  }
});

test("restart asks first, and cancelling keeps the board", async ({ page }) => {
  await page.goto("./");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const [c, r] = await freeCell(page);
  await tapCell(page, c, r);
  await page.getByRole("button", { name: "Restart" }).click();
  const dialog = page.locator("#confirm-restart");
  await expect(dialog).toBeVisible();
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(dialog).toBeHidden();
  expect(await page.evaluate(() => (window as any).__pixels.game.moves)).toBe(1);
  await page.getByRole("button", { name: "Restart" }).click();
  await dialog.getByRole("button", { name: "Restart" }).click();
  await expect.poll(() => page.evaluate(() => (window as any).__pixels.game.moves)).toBe(0);
  // Daily restarts keep the move count.
  await expect(page.locator("#moves")).toHaveText("1");
});

test("the stuck message doesn't move the board", async ({ page }) => {
  await page.goto("./#practice");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  const before = await page.locator("#board").boundingBox();
  const [c, r] = await page.evaluate(() => {
    const p = (window as any).__pixels.game.pixels[0];
    Object.assign(p, { vx: 0, vy: 0 });
    return [Math.floor(p.x), Math.floor(p.y)];
  });
  await tapCell(page, c, r);
  await expect(page.locator("#stuck-note")).toBeVisible();
  expect(await page.locator("#board").boundingBox()).toEqual(before);
});

test("press, drag to aim, and release places the block; releasing off the board cancels", async ({ page }) => {
  await page.goto("./#practice");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  // Freeze the pixels so the cells stay free.
  await page.evaluate(() => {
    for (const p of (window as any).__pixels.game.pixels) Object.assign(p, { vx: 0, vy: 0 });
  });
  const [c, r] = await freeCell(page);
  const cell = await page.evaluate(() => (window as any).__pixels.cell);
  const box = (await page.locator("#board").boundingBox())!;
  const at = (cc: number, rr: number) => [box.x + box.width / 2 - (7 - cc - 0.5) * cell, box.y + box.height / 2 - (10 - rr - 0.5) * cell] as const;
  const index = (cc: number, rr: number) => rr * 14 + cc;
  const cellValue = (i: number) => page.evaluate((i) => (window as any).__pixels.game.cells[i], i);

  // Start a cell away, drag onto the target, release.
  const start = c > 0 ? c - 1 : c + 1;
  await page.mouse.move(...at(start, r));
  await page.mouse.down();
  await page.mouse.move(...at(c, r), { steps: 4 });
  expect(await page.evaluate(() => (window as any).__pixels.aim)).toBe(index(c, r));
  expect(await cellValue(index(c, r))).toBe(0);
  await page.mouse.up();
  expect(await cellValue(index(c, r))).toBe(2);
  expect(await cellValue(index(start, r))).not.toBe(2);

  // Drag off the board before releasing: nothing happens.
  await page.mouse.move(...at(c, r));
  await page.mouse.down();
  await page.mouse.move(box.x + box.width + 40, box.y + box.height / 2, { steps: 4 });
  await page.mouse.up();
  expect(await cellValue(index(c, r))).toBe(2);
  await expect(page.locator("#moves")).toHaveText("1");
});

test("the board fills a tall tablet screen", async ({ browser }) => {
  const page = await browser.newPage({ viewport: { width: 820, height: 1180 } });
  await page.goto("./");
  const box = (await page.locator("#board").boundingBox())!;
  // Height is the limit on a portrait tablet: most of it should be board.
  expect(box.height).toBeGreaterThan(1180 * 0.7);
  await page.close();
});

/** Seals every pixel into the top-left cell with two taps. */
async function winNow(page: Page) {
  await page.evaluate(() => {
    const { game } = (window as any).__pixels;
    game.cells.fill(0);
    for (const p of game.pixels) Object.assign(p, { x: 0.5, y: 0.5, vx: 0, vy: 0 });
  });
  await tapCell(page, 1, 0);
  await tapCell(page, 0, 1);
  await expect(page.locator("#win-overlay")).toBeVisible();
}

test("play again after the daily replays today's board without touching the result", async ({ page }) => {
  await page.goto("./");
  const daily = await page.evaluate(() => (window as any).__pixels.seed);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await winNow(page);
  await page.getByRole("button", { name: "Play again" }).click();
  await expect(page.locator("#start-kicker")).toHaveText(/Daily #\d+ · replay/);
  expect(await page.evaluate(() => (window as any).__pixels.seed)).toBe(daily);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await winNow(page);
  await expect(page.locator("#share-btn")).toBeHidden();
  // Back on the daily: still solved once, with the first result.
  await page.locator('.mode[data-mode="daily"]').click();
  await expect(page.locator("#win-overlay")).toBeVisible();
  await expect(page.locator("#win-extra")).toContainText("Streak 1");
  await expect(page.locator("#share-btn")).toBeVisible();
});

test("play again in practice replays the same board", async ({ page }) => {
  await page.goto("./#practice");
  const seed = await page.evaluate(() => (window as any).__pixels.seed);
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await winNow(page);
  await page.getByRole("button", { name: "Play again" }).click();
  expect(await page.evaluate(() => (window as any).__pixels.seed)).toBe(seed);
  await expect(page.locator("#moves")).toHaveText("0");
});

test("the live score heats up as it grows", async ({ page }) => {
  await page.goto("./#practice");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.locator("#score")).toHaveAttribute("data-heat", "cool");
  await page.evaluate(() => {
    const s = (window as any).__pixels;
    s.elapsedMs = 600_000;
    s.moveOffset = 100;
  });
  await expect(page.locator("#score")).toHaveAttribute("data-heat", "hot");
});
