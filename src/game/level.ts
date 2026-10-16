import {
  COLS,
  PIXEL_COUNT,
  PIXEL_SPEED,
  ROOM_MAX_CELLS,
  ROWS,
  SPAWN_POINTS,
  WALL_GAP_RATIO,
} from "./config";
import { createRng, randInt, type Rng } from "./rng";

export const EMPTY = 0;
export const WALL = 1;
export const PLACED = 2;
export type Cell = typeof EMPTY | typeof WALL | typeof PLACED;

export interface PixelStart {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

export interface Level {
  cols: number;
  rows: number;
  /** Row-major, `WALL` or `EMPTY`. */
  cells: Uint8Array;
  pixels: PixelStart[];
}

/**
 * Builds a board from a seed: rooms carved by recursive division, with
 * doorways between them, and the pixels starting in a few tight clusters
 * so the opening seconds are a race to seal them in.
 */
export function generateLevel(seed: number, cols = COLS, rows = ROWS): Level {
  const rng = createRng(seed);
  const cells = new Uint8Array(cols * rows);
  const at = (c: number, r: number) => cells[r * cols + c];
  const set = (c: number, r: number, v: Cell) => {
    cells[r * cols + c] = v;
  };
  const isOpen = (c: number, r: number) =>
    c >= 0 && r >= 0 && c < cols && r < rows && at(c, r) === EMPTY;

  const divide = (x: number, y: number, w: number, h: number) => {
    if (w * h <= ROOM_MAX_CELLS || (w < 5 && h < 5)) return;
    const horizontal = h > w || (h === w && rng() < 0.5);
    for (let attempt = 0; attempt < 8; attempt++) {
      if (horizontal) {
        if (h < 5) return;
        const wy = y + randInt(rng, 2, h - 3);
        // A wall ending in front of a parent wall's doorway would seal it.
        if (isOpen(x - 1, wy) || isOpen(x + w, wy)) continue;
        for (let c = x; c < x + w; c++) set(c, wy, WALL);
        cutDoors(rng, w, (i) => set(x + i, wy, EMPTY));
        divide(x, y, w, wy - y);
        divide(x, wy + 1, w, y + h - wy - 1);
        return;
      }
      if (w < 5) return;
      const wx = x + randInt(rng, 2, w - 3);
      if (isOpen(wx, y - 1) || isOpen(wx, y + h)) continue;
      for (let r = y; r < y + h; r++) set(wx, r, WALL);
      cutDoors(rng, h, (i) => set(wx, y + i, EMPTY));
      divide(x, y, wx - x, h);
      divide(wx + 1, y, x + w - wx - 1, h);
      return;
    }
  };
  divide(0, 0, cols, rows);

  // Knock a few extra holes so the board reads as rooms, not a maze.
  const walls: number[] = [];
  cells.forEach((v, i) => v === WALL && walls.push(i));
  const holes = Math.round(walls.length * WALL_GAP_RATIO);
  for (let i = 0; i < holes && walls.length; i++) {
    cells[walls.splice(Math.floor(rng() * walls.length), 1)[0]] = EMPTY;
  }

  sealUnreachable(cells, cols, rows);
  const pixels = spawnPixels(rng, cells, cols, rows);
  return { cols, rows, cells, pixels };
}

/** One doorway, two on long walls, each 1–2 cells wide. */
function cutDoors(rng: Rng, length: number, open: (i: number) => void) {
  const doors = length >= 10 ? 2 : 1;
  const span = Math.floor(length / doors);
  for (let d = 0; d < doors; d++) {
    const width = rng() < 0.4 ? 2 : 1;
    const start = d * span + randInt(rng, 0, Math.max(0, span - width));
    for (let i = start; i < Math.min(start + width, length); i++) open(i);
  }
}

/** Fills any open pocket not connected to the largest open area. */
function sealUnreachable(cells: Uint8Array, cols: number, rows: number) {
  const region = new Int32Array(cells.length).fill(-1);
  const sizes: number[] = [];
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] !== EMPTY || region[i] !== -1) continue;
    const id = sizes.length;
    sizes.push(floodFill(cells, cols, rows, [i], (j) => (region[j] = id)));
  }
  const keep = sizes.indexOf(Math.max(...sizes));
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === EMPTY && region[i] !== keep) cells[i] = WALL;
  }
}

function spawnPixels(rng: Rng, cells: Uint8Array, cols: number, rows: number): PixelStart[] {
  const openAt = (c: number, r: number) =>
    c >= 0 && r >= 0 && c < cols && r < rows && cells[r * cols + c] === EMPTY;
  // Spawn centres need a fully open 3×3 block around them, spread apart.
  const candidates: [number, number][] = [];
  for (let r = 1; r < rows - 1; r++) {
    for (let c = 1; c < cols - 1; c++) {
      let clear = true;
      for (let dr = -1; dr <= 1 && clear; dr++)
        for (let dc = -1; dc <= 1 && clear; dc++) clear = openAt(c + dc, r + dr);
      if (clear) candidates.push([c, r]);
    }
  }
  const centres: [number, number][] = [];
  for (let attempt = 0; centres.length < SPAWN_POINTS && attempt < 200; attempt++) {
    const pick = candidates[Math.floor(rng() * candidates.length)];
    if (!pick) break;
    const farEnough = centres.every(([c, r]) => Math.abs(c - pick[0]) + Math.abs(r - pick[1]) >= 8);
    if (farEnough || attempt > 150) centres.push(pick);
  }

  const pixels: PixelStart[] = [];
  for (let i = 0; i < PIXEL_COUNT; i++) {
    const [c, r] = centres[i % centres.length];
    // Within the 3×3 block, away from its outer edge.
    const x = c - 1 + 0.2 + rng() * 2.6;
    const y = r - 1 + 0.2 + rng() * 2.6;
    // Keep both components well away from zero so nothing bounces along
    // one row forever. sqrt (unlike sin/cos) is exact on every engine.
    const u = 0.3 + rng() * 0.65;
    const vx = PIXEL_SPEED * u * (rng() < 0.5 ? -1 : 1);
    const vy = PIXEL_SPEED * Math.sqrt(1 - u * u) * (rng() < 0.5 ? -1 : 1);
    pixels.push({ x, y, vx, vy });
  }
  return pixels;
}

/**
 * 4-way flood fill from `starts` through `EMPTY` cells (start cells are
 * visited whatever they hold). Returns how many cells were visited.
 */
export function floodFill(
  cells: Uint8Array,
  cols: number,
  rows: number,
  starts: number[],
  visit: (i: number) => void,
  seen = new Uint8Array(cells.length),
): number {
  const stack: number[] = [];
  for (const s of starts) {
    if (!seen[s]) {
      seen[s] = 1;
      stack.push(s);
    }
  }
  let count = 0;
  while (stack.length) {
    const i = stack.pop()!;
    visit(i);
    count++;
    const c = i % cols;
    const r = (i - c) / cols;
    const next = [
      c > 0 ? i - 1 : -1,
      c < cols - 1 ? i + 1 : -1,
      r > 0 ? i - cols : -1,
      r < rows - 1 ? i + cols : -1,
    ];
    for (const j of next) {
      if (j >= 0 && !seen[j] && cells[j] === EMPTY) {
        seen[j] = 1;
        stack.push(j);
      }
    }
  }
  return count;
}
