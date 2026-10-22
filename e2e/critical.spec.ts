/**
 * The flows players would notice first if a deploy broke them: the daily
 * puzzle across days, saved progress, sharing, the pixies themselves,
 * layout on real screen sizes, and the page's metadata.
 */
import { expect, freezePixies, gatherInCorner, start, state, tapCell, test, winNow, type Page } from "./fixtures";

// Dates are local: pin a timezone so "tomorrow" means the same everywhere.
test.use({ timezoneId: "America/Denver" });

const at = (day: string, time = "10:00") => new Date(`${day}T${time}:00-06:00`);

async function boardSignature(page: Page) {
  return page.evaluate(() => {
    const { game, seed } = (window as any).__pixels;
    return { seed, cells: Array.from(game.cells as Uint8Array).join("") };
  });
}

/** Captures what Share hands to the share sheet or the clipboard. */
async function captureShares(page: Page) {
  await page.addInitScript(() => {
    const w = window as any;
    w.__shared = [];
    Object.defineProperty(navigator, "share", { value: async (d: { text: string }) => w.__shared.push(d.text) });
    Object.defineProperty(navigator, "clipboard", { value: { writeText: async (t: string) => w.__shared.push(t) } });
  });
}

test.describe("daily puzzle", () => {
  test("everyone gets the same board on the same day, and a new one tomorrow", async ({ page, browser }) => {
    await page.clock.setFixedTime(at("2026-10-22"));
    await page.goto("./");
    await expect(page.locator("#start-kicker")).toHaveText("Daily #7");
    const today = await boardSignature(page);

    // Another device (fresh context, no shared storage) gets the same board.
    const other = await browser.newPage({ timezoneId: "America/Denver" });
    await other.route("https://thorsteingames.com/tg-bar.js", (r) => r.fulfill({ contentType: "text/javascript", body: "" }));
    await other.clock.setFixedTime(at("2026-10-22", "23:30"));
    await other.goto("./");
    expect(await boardSignature(other)).toEqual(today);
    await other.close();

    await page.clock.setFixedTime(at("2026-10-23"));
    await page.reload();
    await expect(page.locator("#start-kicker")).toHaveText("Daily #8");
    const tomorrow = await boardSignature(page);
    expect(tomorrow.seed).not.toBe(today.seed);
    expect(tomorrow.cells).not.toBe(today.cells);
  });

  test("streaks build day by day, survive reloads, and reset after a missed day", async ({ page }) => {
    // Plays three full days (solve, win animation, reload each), which can
    // take over 30s in CI's WebKit. The checks are unchanged; only the
    // time limit is tripled.
    test.slow();
    for (const [day, streak, best] of [
      ["2026-10-22", 1, 1],
      ["2026-10-23", 2, 2],
      ["2026-10-25", 1, 2],
    ] as const) {
      await page.clock.setFixedTime(at(day));
      await page.goto("./");
      await start(page);
      await winNow(page);
      await expect(page.locator("#win-extra")).toContainText(`Streak ${streak} · Best ${best}`);
      await page.reload();
      await expect(page.locator("#win-overlay")).toBeVisible();
      await expect(page.locator("#win-extra")).toContainText(`Streak ${streak} · Best ${best}`);
    }
  });

  test("a solved daily stays solved: no restart, no replaying it for a better score", async ({ page }) => {
    await page.clock.setFixedTime(at("2026-10-22"));
    await page.goto("./");
    await start(page);
    await winNow(page);
    // The win card counts its numbers up; wait for the final values.
    await expect(page.locator("#win-moves")).toHaveText("2");
    const score = ((await state(page)).result.score as number).toLocaleString("en-US");
    await expect(page.locator("#win-score")).toHaveText(score);
    await page.reload();
    await expect(page.locator("#win-overlay")).toBeVisible();
    await expect(page.locator("#start-overlay")).toBeHidden();
    await expect(page.locator("#restart-btn")).toBeHidden();
    await expect(page.locator("#win-moves")).toHaveText("2");
    await expect(page.locator("#win-score")).toHaveText(score);
    expect((await state(page)).running).toBe(false);
  });

  test("daily progress survives a trip to practice and back", async ({ page }) => {
    await page.clock.setFixedTime(at("2026-10-22"));
    await page.goto("./");
    await start(page);
    await freezePixies(page);
    for (const [c, r] of [[13, 19], [12, 19], [13, 18]]) await tapCell(page, c, r);
    const moves = Number(await page.locator("#moves").textContent());
    expect(moves).toBeGreaterThan(0);
    await page.locator('.mode[data-mode="practice"]').click();
    await expect(page.locator("#start-kicker")).toHaveText("Practice");
    await expect(page.locator("#moves")).toHaveText("0");
    await page.locator('.mode[data-mode="daily"]').click();
    await expect(page.getByRole("button", { name: "Continue" })).toBeVisible();
    await expect(page.locator("#moves")).toHaveText(String(moves));
  });

  test("share sends the puzzle number, time, moves, score, streak-free first day, and the link", async ({ page }) => {
    await captureShares(page);
    await page.clock.setFixedTime(at("2026-10-22"));
    await page.goto("./");
    await start(page);
    await winNow(page);
    await page.getByRole("button", { name: "Share" }).click();
    await expect.poll(() => page.evaluate(() => (window as any).__shared.length)).toBe(1);
    const text: string = await page.evaluate(() => (window as any).__shared[0]);
    const lines = text.split("\n");
    expect(lines[0]).toBe("Pix Pen #7");
    expect(lines[1]).toMatch(/^⏱ \d+:\d\d · 🧱 2 moves$/);
    expect(lines[2]).toMatch(/^Score [\d,]+ \(lower wins\)$/);
    expect(lines[3]).toBe("https://thorsteingames.com/pix-pen");
  });
});

test.describe("play", () => {
  test("nothing moves and the clock doesn't run until Start", async ({ page }) => {
    await page.goto("./#practice");
    const before = await state(page);
    await page.waitForTimeout(600);
    const after = await state(page);
    expect(after.elapsedMs).toBe(0);
    expect(after.game.pixels).toEqual(before.game.pixels);
    await start(page);
    await expect.poll(async () => (await state(page)).elapsedMs).toBeGreaterThan(300);
  });

  test("the help screen pauses the clock and the pixies", async ({ page }) => {
    await page.goto("./#practice");
    await start(page);
    await page.waitForTimeout(300);
    await page.getByRole("button", { name: "How to play" }).click();
    await expect(page.locator("#help")).toBeVisible();
    const paused = await state(page);
    await page.waitForTimeout(1000);
    const later = await state(page);
    expect(later.elapsedMs).toBe(paused.elapsedMs);
    expect(later.game.pixels).toEqual(paused.game.pixels);
    await page.getByRole("button", { name: "Got it" }).click();
    await expect.poll(async () => (await state(page)).elapsedMs).toBeGreaterThan(paused.elapsedMs);
  });

  test("walls can't be built on, and the meter tracks the area the pixies can reach", async ({ page }) => {
    await page.goto("./#practice");
    await start(page);
    const wall = await page.evaluate(() => (window as any).__pixels.game.cells.indexOf(1));
    await tapCell(page, wall % 14, Math.floor(wall / 14));
    await expect(page.locator("#moves")).toHaveText("0");
    await expect(page.locator("#area-text")).toHaveText("Pixies can reach 100%");
    await gatherInCorner(page);
    await tapCell(page, 1, 0);
    await expect(page.locator("#area-text")).not.toHaveText("Pixies can reach 100%");
    await tapCell(page, 0, 1);
    await expect(page.locator("#area-text")).toHaveText("Pixies can reach 1%");
    await expect(page.locator("#meter-fill")).toHaveClass(/ok/);
  });

  test("a trapped pixie blocks the win until it's freed", async ({ page }) => {
    await page.goto("./#practice");
    await start(page);
    await gatherInCorner(page);
    // Trap the pixies in their corner cell, then seal the corner.
    await tapCell(page, 0, 0);
    await expect(page.locator("#stuck-note")).toContainText("100 pixies stuck!");
    await tapCell(page, 1, 0);
    await tapCell(page, 0, 1);
    await expect(page.locator("#win-overlay")).toBeHidden();
    // Freeing them completes the pen.
    await tapCell(page, 0, 0);
    await expect(page.locator("#stuck-note")).toBeHidden();
    await expect(page.locator("#win-overlay")).toBeVisible();
    await expect(page.locator("#win-moves")).toHaveText("4");
  });

  test("New board gives a different practice board", async ({ page }) => {
    await page.goto("./#practice");
    const first = await boardSignature(page);
    await page.getByRole("button", { name: "New board" }).click();
    const second = await boardSignature(page);
    expect(second.seed).not.toBe(first.seed);
  });
});

test.describe("pixies", () => {
  /** Colour of the canvas pixel under pixie `i`'s centre. */
  async function colourUnder(page: Page, i: number) {
    return page.evaluate((i) => {
      const s = (window as any).__pixels;
      const canvas = document.getElementById("board") as HTMLCanvasElement;
      const p = s.game.pixels[i];
      const k = canvas.width / (s.game.cols * s.cell);
      const d = canvas.getContext("2d")!.getImageData(Math.floor(p.x * s.cell * k), Math.floor(p.y * s.cell * k), 1, 1).data;
      return [d[0], d[1], d[2]];
    }, i);
  }

  for (const look of ["pixie", "classic"]) {
    test(`are drawn on the board (${look} look)`, async ({ page }) => {
      await page.goto(look === "classic" ? "./?look=classic#practice" : "./#practice");
      await start(page);
      await freezePixies(page);
      await page.waitForTimeout(150);
      // The pixie body colour, #8ff3ff, sits under each pixie's centre.
      for (const i of [0, 37, 99]) {
        const [r, g, b] = await colourUnder(page, i);
        expect(r).toBeGreaterThan(110);
        expect(g).toBeGreaterThan(200);
        expect(b).toBeGreaterThan(200);
      }
    });
  }

  test("leave sparkles only while they fly", async ({ page }) => {
    await page.goto("./#practice");
    const sparkles = () => page.evaluate(() => (window as any).__pixels.anim.sparkles.length);
    await page.waitForTimeout(400);
    expect(await sparkles()).toBe(0);
    await start(page);
    await expect.poll(sparkles).toBeGreaterThan(10);
    await page.getByRole("button", { name: "How to play" }).click();
    await expect.poll(sparkles, { timeout: 2000 }).toBe(0);
  });
});

test.describe("layout", () => {
  for (const [w, h] of [
    [320, 568],
    [360, 640],
    [375, 667],
    [390, 844],
    [430, 932],
    [768, 1024],
    [1280, 800],
    [1920, 1080],
  ]) {
    test(`${w}×${h}: everything fits with nothing squeezed or overflowing`, async ({ page }) => {
      await page.setViewportSize({ width: w, height: h });
      await page.goto("./#practice");
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
      expect(overflow).toBeLessThanOrEqual(0);
      const board = (await page.locator("#board").boundingBox())!;
      const controls = (await page.locator(".controls").boundingBox())!;
      const help = (await page.locator("#help-btn").boundingBox())!;
      const logo = (await page.locator(".title img").boundingBox())!;
      // Board and buttons fully on screen, below the 40px bar.
      expect(board.y).toBeGreaterThanOrEqual(40);
      expect(board.x).toBeGreaterThanOrEqual(0);
      expect(board.x + board.width).toBeLessThanOrEqual(w);
      expect(controls.y + controls.height).toBeLessThanOrEqual(h);
      // Cells big enough to tap (phones) and the help button not squashed.
      expect((await state(page)).cell).toBeGreaterThanOrEqual(w < 400 ? 18 : 24);
      expect(help.width).toBeGreaterThanOrEqual(26);
      expect(logo.width).toBeGreaterThan(60);
    });
  }
});

test.describe("page", () => {
  test("has the Pix Pen title, address, previews and structured data", async ({ page, request }) => {
    await page.goto("./");
    await expect(page).toHaveTitle(/^Pix Pen/);
    await expect(page.locator('link[rel="canonical"]')).toHaveAttribute("href", "https://thorsteingames.com/pix-pen");
    await expect(page.locator('meta[property="og:url"]')).toHaveAttribute("content", "https://thorsteingames.com/pix-pen");
    await expect(page.locator('meta[name="description"]')).toHaveAttribute("content", /pixies/);
    const ld = JSON.parse((await page.locator('script[type="application/ld+json"]').textContent())!);
    expect(ld).toMatchObject({ "@type": "VideoGame", name: "Pix Pen", url: "https://thorsteingames.com/pix-pen" });
    const manifest = await (await request.get("manifest.webmanifest")).json();
    expect(manifest).toMatchObject({ name: "Pix Pen", start_url: "/pix-pen/", scope: "/pix-pen/" });
    expect(await (await request.get("sitemap.xml")).text()).toContain("<loc>https://thorsteingames.com/pix-pen</loc>");
    for (const tag of ["tg-bar", "tg-footer", "tg-more-games"]) {
      await expect(page.locator(tag).first()).toHaveAttribute("game", "pix-pen");
    }
  });

  test("loads its scripts and styles from /pix-pen/", async ({ page }) => {
    const assets: string[] = [];
    page.on("request", (r) => r.url().includes("/assets/") && assets.push(new URL(r.url()).pathname));
    await page.goto("./");
    await expect(page.locator("#board")).toBeVisible();
    expect(assets.length).toBeGreaterThan(0);
    for (const path of assets) expect(path.startsWith("/pix-pen/assets/")).toBe(true);
  });
});
