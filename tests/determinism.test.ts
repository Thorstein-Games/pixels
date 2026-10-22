/**
 * Guards for the daily puzzle: everyone must get the same board and the same
 * pixie paths, today and on any day already played. A failure here means a
 * change altered daily boards. If that was intended (a tuning change), update
 * the snapshots and expect players mid-way through today's board to get a new
 * one; otherwise, find what changed.
 */
import { describe, expect, it } from "vitest";
import { addDays, dailySeed } from "../src/daily";
import { generateLevel } from "../src/game/level";
import { createRng, hashString, randInt } from "../src/game/rng";
import { STEP_SECONDS } from "../src/game/config";
import { advance, createGame, step, type Game } from "../src/game/sim";

/** Compact, order-sensitive fingerprint of numbers (FNV-1a over fixed-point). */
function fingerprint(values: Iterable<number>): string {
  let h = 0x811c9dc5;
  for (const v of values) {
    h ^= Math.round(v * 1e6) | 0;
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

function levelFingerprint(seed: number) {
  const level = generateLevel(seed);
  return {
    cells: fingerprint(level.cells),
    pixels: fingerprint(level.pixels.flatMap((p) => [p.x, p.y, p.vx, p.vy])),
  };
}

describe("rng", () => {
  it("produces the same sequence for a seed", () => {
    const a = createRng(123);
    const b = createRng(123);
    const seqA = Array.from({ length: 50 }, a);
    expect(Array.from({ length: 50 }, b)).toEqual(seqA);
    expect(Array.from({ length: 50 }, createRng(124))).not.toEqual(seqA);
  });

  it("stays in [0, 1) and spreads out", () => {
    const rng = createRng(7);
    const values = Array.from({ length: 10_000 }, rng);
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    const mean = values.reduce((s, v) => s + v, 0) / values.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });

  it("randInt covers both ends of its range and nothing outside", () => {
    const rng = createRng(9);
    const seen = new Set<number>();
    for (let i = 0; i < 2000; i++) seen.add(randInt(rng, 2, 5));
    expect([...seen].sort()).toEqual([2, 3, 4, 5]);
  });

  it("hashString is stable (daily seeds depend on it)", () => {
    expect(hashString("")).toBe(0x811c9dc5);
    expect(hashString("pixels:2026-10-16")).toMatchInlineSnapshot(`4275689730`);
    expect(hashString("a")).not.toBe(hashString("b"));
  });
});

describe("daily boards", () => {
  it("seed each day from the date, differently every day", () => {
    expect(dailySeed("2026-10-22")).toBe(dailySeed("2026-10-22"));
    const seeds = new Set(Array.from({ length: 365 }, (_, i) => dailySeed(addDays("2026-10-16", i))));
    expect(seeds.size).toBe(365);
  });

  it("launch day and a later day still generate the same boards", () => {
    expect(levelFingerprint(dailySeed("2026-10-16"))).toMatchInlineSnapshot(`
      {
        "cells": "e75afe25",
        "pixels": "c340c943",
      }
    `);
    expect(levelFingerprint(dailySeed("2026-10-22"))).toMatchInlineSnapshot(`
      {
        "cells": "5cb63625",
        "pixels": "67b7a8ec",
      }
    `);
  });

  it("pixies follow the same paths for 30 seconds", () => {
    const game = createGame(generateLevel(dailySeed("2026-10-22")));
    for (let i = 0; i < 30 * 60; i++) advance(game, 1 / 60);
    expect(fingerprint(game.pixels.flatMap((p) => [p.x, p.y, p.vx, p.vy]))).toMatchInlineSnapshot(`"adc2b5f8"`);
  });

  it("frame rate doesn't change the paths (fixed-step simulation)", () => {
    const at60 = createGame(generateLevel(dailySeed("2026-10-22")));
    const at144 = createGame(generateLevel(dailySeed("2026-10-22")));
    const uneven = createGame(generateLevel(dailySeed("2026-10-22")));
    for (let i = 0; i < 600; i++) advance(at60, 1 / 60);
    for (let i = 0; i < 1440; i++) advance(at144, 1 / 144);
    // Jittery frames, like a busy phone, still add up to 10 seconds.
    let t = 0;
    for (let i = 0; t < 10 - 1e-9; i++) {
      const dt = Math.min([0.007, 0.016, 0.033, 0.021][i % 4], 10 - t);
      advance(uneven, dt);
      t += dt;
    }
    // Float leftovers can leave one of them a single step (1/120 s) behind;
    // catch it up so all three have taken the same number of steps.
    const games = [at60, at144, uneven];
    const steps = (g: Game) => Math.round((10 - g.carry) / STEP_SECONDS);
    const most = Math.max(...games.map(steps));
    for (const g of games) {
      expect(most - steps(g)).toBeLessThanOrEqual(1);
      while (steps(g) < most) {
        step(g, STEP_SECONDS);
        g.carry -= STEP_SECONDS;
      }
    }
    const pos = (g: Game) => g.pixels.map((p) => [p.x, p.y]);
    expect(pos(at144)).toEqual(pos(at60));
    expect(pos(uneven)).toEqual(pos(at60));
  });
});
