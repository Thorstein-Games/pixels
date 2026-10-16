import { PIXEL_RADIUS, STEP_SECONDS, WIN_AREA_RATIO } from "./config";
import { EMPTY, PLACED, WALL, floodFill, type Level } from "./level";

export interface Pixel {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Index of the placed square holding this pixel, or -1 while it moves. */
  stuckIn: number;
}

export interface Game {
  cols: number;
  rows: number;
  cells: Uint8Array;
  pixels: Pixel[];
  /** Open cells at the start; the win threshold is a share of this. */
  openCells: number;
  moves: number;
  /** Cells currently reachable by some pixel (see `measure`). */
  reachable: Uint8Array;
  area: number;
  stuck: number;
  won: boolean;
  /** Leftover time below one fixed step, carried to the next frame. */
  carry: number;
}

export type TapResult = "placed" | "removed" | "blocked" | "none";

export function createGame(level: Level): Game {
  const cells = level.cells.slice();
  let openCells = 0;
  for (const v of cells) if (v === EMPTY) openCells++;
  const game: Game = {
    cols: level.cols,
    rows: level.rows,
    cells,
    pixels: level.pixels.map((p) => ({ ...p, stuckIn: -1 })),
    openCells,
    moves: 0,
    reachable: new Uint8Array(cells.length),
    area: 0,
    stuck: 0,
    won: false,
    carry: 0,
  };
  measure(game);
  return game;
}

export function winArea(game: Game): number {
  return Math.floor(game.openCells * WIN_AREA_RATIO);
}

/** Advances the simulation by `seconds` of real time in fixed steps. */
export function advance(game: Game, seconds: number) {
  game.carry += Math.min(seconds, 0.25);
  while (game.carry >= STEP_SECONDS) {
    step(game, STEP_SECONDS);
    game.carry -= STEP_SECONDS;
  }
}

function solid(game: Game, x: number, y: number): boolean {
  const c = Math.floor(x);
  const r = Math.floor(y);
  if (c < 0 || r < 0 || c >= game.cols || r >= game.rows) return true;
  return game.cells[r * game.cols + c] !== EMPTY;
}

/**
 * Moves each free pixel one step, an axis at a time: a pixel whose leading
 * edge would enter a solid cell reverses on that axis instead. Moving the
 * axes separately also stops pixels slipping between diagonal neighbours,
 * which keeps them inside the 4-connected regions `measure` counts.
 */
export function step(game: Game, dt: number) {
  for (const p of game.pixels) {
    if (p.stuckIn >= 0) continue;
    const nx = p.x + p.vx * dt;
    if (solid(game, nx + Math.sign(p.vx) * PIXEL_RADIUS, p.y)) p.vx = -p.vx;
    else p.x = nx;
    const ny = p.y + p.vy * dt;
    if (solid(game, p.x, ny + Math.sign(p.vy) * PIXEL_RADIUS)) p.vy = -p.vy;
    else p.y = ny;
  }
}

export function cellOf(game: Game, p: { x: number; y: number }): number {
  return Math.floor(p.y) * game.cols + Math.floor(p.x);
}

/**
 * Places a square on an empty cell or removes a placed one. Placing on top
 * of pixels traps them in it; removing it lets them carry on as they were.
 */
export function tap(game: Game, c: number, r: number): TapResult {
  if (game.won || c < 0 || r < 0 || c >= game.cols || r >= game.rows) return "none";
  const i = r * game.cols + c;
  const v = game.cells[i];
  if (v === WALL) return "blocked";
  if (v === EMPTY) {
    game.cells[i] = PLACED;
    for (const p of game.pixels) if (p.stuckIn < 0 && cellOf(game, p) === i) p.stuckIn = i;
  } else {
    game.cells[i] = EMPTY;
    for (const p of game.pixels) if (p.stuckIn === i) p.stuckIn = -1;
  }
  game.moves++;
  measure(game);
  if (game.stuck === 0 && game.area <= winArea(game)) game.won = true;
  return v === EMPTY ? "placed" : "removed";
}

/**
 * Recomputes which cells any pixel can reach. Pixels can't cross walls, so
 * this only changes when a square is placed or removed. A stuck pixel
 * counts as being in its square, which reaches whatever its neighbours do.
 */
export function measure(game: Game) {
  game.reachable.fill(0);
  const starts: number[] = [];
  let stuck = 0;
  for (const p of game.pixels) {
    if (p.stuckIn >= 0) stuck++;
    starts.push(p.stuckIn >= 0 ? p.stuckIn : cellOf(game, p));
  }
  game.area = floodFill(game.cells, game.cols, game.rows, starts, (i) => (game.reachable[i] = 1));
  game.stuck = stuck;
}
