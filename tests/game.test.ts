import { describe, expect, it } from "vitest";
import { PIXEL_COUNT } from "../src/game/config";
import { EMPTY, PLACED, WALL, floodFill, generateLevel } from "../src/game/level";
import { advance, cellOf, createGame, tap, winArea } from "../src/game/sim";

describe("generateLevel", () => {
  it("is deterministic for a seed", () => {
    expect(generateLevel(42)).toEqual(generateLevel(42));
    expect(generateLevel(42).cells).not.toEqual(generateLevel(43).cells);
  });

  it("leaves one connected open area with every pixel inside it", () => {
    for (let seed = 1; seed <= 200; seed++) {
      const level = generateLevel(seed);
      const { cells, cols, rows } = level;
      const first = cells.indexOf(EMPTY);
      const open = cells.filter((v) => v === EMPTY).length;
      expect(floodFill(cells, cols, rows, [first], () => {})).toBe(open);
      expect(open).toBeGreaterThan(cells.length * 0.75);
      expect(level.pixels).toHaveLength(PIXEL_COUNT);
      for (const p of level.pixels) {
        expect(cells[Math.floor(p.y) * cols + Math.floor(p.x)]).toBe(EMPTY);
      }
    }
  });
});

describe("simulation", () => {
  it("never lets a pixel into a solid cell", () => {
    const game = createGame(generateLevel(7));
    for (let t = 0; t < 60 * 20; t++) {
      advance(game, 1 / 60);
      if (t % 30 === 0) {
        // Drop squares around the board to bounce pixels off fresh walls.
        tap(game, (t * 7) % game.cols, (t * 3) % game.rows);
      }
      for (const p of game.pixels) {
        if (p.stuckIn >= 0) continue;
        expect(game.cells[cellOf(game, p)]).toBe(EMPTY);
      }
    }
  });

  it("plays out identically from the same start", () => {
    const a = createGame(generateLevel(9));
    const b = createGame(generateLevel(9));
    for (let i = 0; i < 300; i++) advance(a, 1 / 60);
    for (let i = 0; i < 100; i++) advance(b, 3 / 60);
    expect(a.pixels).toEqual(b.pixels);
  });
});

describe("tap", () => {
  it("traps pixels under a placed square until it is removed", () => {
    const game = createGame(generateLevel(3));
    const p = game.pixels[0];
    const i = cellOf(game, p);
    const c = i % game.cols;
    const r = Math.floor(i / game.cols);
    const before = { ...p };
    expect(tap(game, c, r)).toBe("placed");
    expect(game.cells[i]).toBe(PLACED);
    expect(p.stuckIn).toBe(i);
    expect(game.stuck).toBeGreaterThan(0);
    advance(game, 1);
    expect(p.x).toBe(before.x);
    expect(tap(game, c, r)).toBe("removed");
    expect(p.stuckIn).toBe(-1);
    expect(game.stuck).toBe(0);
    expect(game.moves).toBe(2);
    advance(game, 0.1);
    expect(Math.sign(p.x - before.x)).toBe(Math.sign(before.vx));
  });

  it("ignores walls", () => {
    const game = createGame(generateLevel(3));
    const i = game.cells.indexOf(WALL);
    expect(tap(game, i % game.cols, Math.floor(i / game.cols))).toBe("blocked");
    expect(game.moves).toBe(0);
  });

  it("wins once every pixel is sealed into a small enough area", () => {
    const game = createGame(generateLevel(5));
    // Pull every pixel into the top-left corner, then box it in.
    for (const p of game.pixels) Object.assign(p, { x: 0.5, y: 0.5 });
    game.cells.fill(EMPTY);
    game.openCells = game.cells.length;
    tap(game, 2, 0);
    tap(game, 2, 1);
    expect(game.won).toBe(false);
    tap(game, 0, 2);
    expect(game.won).toBe(false);
    tap(game, 1, 2);
    expect(game.area).toBe(4);
    expect(game.area).toBeLessThanOrEqual(winArea(game));
    expect(game.won).toBe(true);
  });

  it("can't win while a pixel is stuck", () => {
    const game = createGame(generateLevel(5));
    game.cells.fill(EMPTY);
    game.openCells = game.cells.length;
    game.pixels.forEach((p, n) => Object.assign(p, { x: 0.5, y: n === 0 ? 1.5 : 0.5 }));
    tap(game, 0, 1); // traps pixel 0 and splits off nothing yet
    tap(game, 1, 0);
    tap(game, 1, 1);
    expect(game.stuck).toBe(1);
    expect(game.won).toBe(false);
  });
});
