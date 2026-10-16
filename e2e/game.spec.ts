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
  await expect(page.getByRole("heading", { name: "Trapped!" })).toBeVisible();
  await expect(page.locator("#win-moves")).toHaveText("2");
  await page.reload();
  await expect(page.locator("#win-overlay")).toBeVisible();
  await expect(page.locator("#win-extra")).toContainText("Streak 1");
  await expect(page.locator("#restart-btn")).toBeHidden();
});
