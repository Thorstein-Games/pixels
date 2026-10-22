import { describe, expect, it } from "vitest";
import { PIXEL_COUNT, PIXEL_SPEED, SPAWN_POINTS, WIN_AREA_PERCENT } from "../src/game/config";
import { EMPTY, PLACED, WALL, floodFill, generateLevel, type Level } from "../src/game/level";
import { createRng } from "../src/game/rng";
import { advance, cellOf, createGame, measure, reachPercent, tap, winArea, type Game } from "../src/game/sim";

/** An empty board with the given pixels, for hand-built scenarios. */
function openBoard(pixels: [number, number, number, number][], cols = 10, rows = 10): Game {
  const level: Level = {
    cols,
    rows,
    cells: new Uint8Array(cols * rows),
    pixels: pixels.map(([x, y, vx, vy]) => ({ x, y, vx, vy })),
  };
  return createGame(level);
}

const at = (g: Game, c: number, r: number) => g.cells[r * g.cols + c];

describe("level generation", () => {
  it("gives every pixie the same speed, never close to straight along a row or column", () => {
    for (let seed = 1; seed <= 50; seed++) {
      for (const p of generateLevel(seed).pixels) {
        expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(PIXEL_SPEED, 9);
        expect(Math.abs(p.vx)).toBeGreaterThan(PIXEL_SPEED * 0.25);
        expect(Math.abs(p.vy)).toBeGreaterThan(PIXEL_SPEED * 0.25);
      }
    }
  });

  it("starts pixies in tight clusters", () => {
    const level = generateLevel(11);
    expect(level.pixels).toHaveLength(PIXEL_COUNT);
    const cells = new Set(level.pixels.map((p) => Math.floor(p.y) * level.cols + Math.floor(p.x)));
    // SPAWN_POINTS clusters of at most 3×3 cells each.
    expect(cells.size).toBeLessThanOrEqual(SPAWN_POINTS * 9);
  });

  it("honours tuning overrides", () => {
    const level = generateLevel(3, { cols: 8, rows: 12, pixelCount: 7 });
    expect(level.cols).toBe(8);
    expect(level.rows).toBe(12);
    expect(level.cells).toHaveLength(96);
    expect(level.pixels).toHaveLength(7);
  });

  it("only uses open and wall cells", () => {
    for (let seed = 1; seed <= 50; seed++) {
      for (const v of generateLevel(seed).cells) expect([EMPTY, WALL]).toContain(v);
    }
  });
});

describe("floodFill", () => {
  it("fills 4-connected open cells and stops at walls and diagonals", () => {
    // 3×3 with a wall column in the middle: left and right halves are apart.
    const cells = Uint8Array.from([0, 1, 0, 0, 1, 0, 0, 1, 0]);
    const seen: number[] = [];
    expect(floodFill(cells, 3, 3, [0], (i) => seen.push(i))).toBe(3);
    expect(seen.sort()).toEqual([0, 3, 6]);
    // Diagonal neighbours don't connect.
    const diag = Uint8Array.from([0, 1, 1, 0]);
    expect(floodFill(diag, 2, 2, [0], () => {})).toBe(1);
  });

  it("counts each cell once even with repeated starts", () => {
    const cells = new Uint8Array(4);
    expect(floodFill(cells, 2, 2, [0, 0, 3], () => {})).toBe(4);
  });
});

describe("simulation", () => {
  it("keeps every pixie inside the area the win check counts, through random play", () => {
    // The win check only looks at the reachable area, so a pixie slipping
    // outside it would let a board be won while pixies roam free.
    const escapes: string[] = [];
    for (const seed of [2, 5, 9]) {
      const game = createGame(generateLevel(seed));
      const rng = createRng(seed);
      for (let t = 0; t < 4000; t++) {
        advance(game, 1 / 60);
        if (t % 7 === 0) tap(game, Math.floor(rng() * game.cols), Math.floor(rng() * game.rows));
        if (game.won) break;
        for (const p of game.pixels) {
          const i = p.stuckIn >= 0 ? p.stuckIn : cellOf(game, p);
          if (!game.reachable[i] || (p.stuckIn < 0 && game.cells[i] !== EMPTY)) {
            escapes.push(`seed ${seed}, frame ${t}: pixie in cell ${i}`);
          }
        }
      }
    }
    expect(escapes).toEqual([]);
  });

  it("bounces keep each pixie's speed", () => {
    const game = createGame(generateLevel(4));
    for (let i = 0; i < 1200; i++) advance(game, 1 / 60);
    for (const p of game.pixels) expect(Math.hypot(p.vx, p.vy)).toBeCloseTo(PIXEL_SPEED, 9);
  });

  it("reverses off the board's edge", () => {
    const game = openBoard([[9.5, 5.5, 1.5, 0.4]]);
    for (let i = 0; i < 60; i++) advance(game, 1 / 60);
    const p = game.pixels[0];
    expect(p.vx).toBeLessThan(0);
    expect(p.x).toBeLessThan(10);
  });

  it("caps a long gap between frames (returning to a backgrounded tab)", () => {
    const a = createGame(generateLevel(6));
    const b = createGame(generateLevel(6));
    advance(a, 60);
    advance(b, 0.25);
    expect(a.pixels).toEqual(b.pixels);
  });

  it("freezes stuck pixies and leaves the rest moving", () => {
    const game = openBoard([
      [2.5, 2.5, 1, 0.5],
      [6.5, 6.5, 1, 0.5],
    ]);
    tap(game, 2, 2);
    const before = game.pixels.map((p) => ({ ...p }));
    advance(game, 0.5);
    expect(game.pixels[0]).toEqual(before[0]);
    expect(game.pixels[1].x).not.toBe(before[1].x);
  });
});

describe("tap", () => {
  it("places, then removes, counting a move each time", () => {
    const game = openBoard([[0.5, 0.5, 0, 0]]);
    expect(tap(game, 5, 5)).toBe("placed");
    expect(at(game, 5, 5)).toBe(PLACED);
    expect(tap(game, 5, 5)).toBe("removed");
    expect(at(game, 5, 5)).toBe(EMPTY);
    expect(game.moves).toBe(2);
  });

  it("ignores taps off the board", () => {
    const game = openBoard([[0.5, 0.5, 0, 0]]);
    for (const [c, r] of [[-1, 0], [0, -1], [10, 0], [0, 10]]) expect(tap(game, c, r)).toBe("none");
    expect(game.moves).toBe(0);
  });

  it("traps every pixie under the block and frees them all together", () => {
    const game = openBoard([
      [3.2, 3.3, 1, 0.5],
      [3.8, 3.7, -1, 0.5],
      [7.5, 7.5, 1, 0.5],
    ]);
    tap(game, 3, 3);
    expect(game.stuck).toBe(2);
    expect(game.pixels.map((p) => p.stuckIn >= 0)).toEqual([true, true, false]);
    tap(game, 3, 3);
    expect(game.stuck).toBe(0);
  });

  it("only traps pixies whose centre is in the cell", () => {
    // Just over the edge of (3, 3): not trapped.
    const game = openBoard([[4.01, 3.5, 1, 0.5]]);
    tap(game, 3, 3);
    expect(game.stuck).toBe(0);
  });

  it("does nothing once the board is won", () => {
    const game = openBoard([[0.5, 0.5, 0, 0]]);
    tap(game, 1, 0);
    tap(game, 0, 1);
    expect(game.won).toBe(true);
    expect(tap(game, 5, 5)).toBe("none");
    expect(game.moves).toBe(2);
  });

  it("removing a block can re-open an area and un-win the count", () => {
    const game = openBoard([[0.5, 0.5, 0, 0]]);
    tap(game, 1, 0);
    expect(game.area).toBe(100 - 1);
    tap(game, 0, 1);
    expect(game.area).toBe(1);
  });
});

describe("area and winning", () => {
  it("counts only cells some pixie can reach", () => {
    // A wall splits the board; pixies only on the left.
    const game = openBoard([[1.5, 1.5, 0, 0]]);
    for (let r = 0; r < 10; r++) game.cells[r * 10 + 5] = WALL;
    measure(game);
    expect(game.area).toBe(50);
    expect(game.reachable[9]).toBe(0);
  });

  it("puts the goal at WIN_AREA_PERCENT of the open cells", () => {
    const game = openBoard([[0.5, 0.5, 0, 0]], 20, 20);
    expect(winArea(game)).toBe(Math.floor((400 * WIN_AREA_PERCENT) / 100));
  });

  it("wins at exactly the goal area, not one cell more", () => {
    // 20×20 = 400 open cells at the start. Leave the first `len` cells (in
    // reading order, so they stay connected) open and wall off the rest.
    const goal = Math.floor((400 * WIN_AREA_PERCENT) / 100);
    for (const len of [goal + 1, goal, goal - 1]) {
      const game = openBoard([[0.5, 0.5, 0, 0]], 20, 20);
      for (let i = len; i < 400; i++) game.cells[i] = WALL;
      measure(game);
      expect(game.area).toBe(len);
      const won = game.area <= winArea(game);
      expect(won).toBe(len <= goal);
      expect(reachPercent(game) <= WIN_AREA_PERCENT).toBe(won);
    }
  });
});
