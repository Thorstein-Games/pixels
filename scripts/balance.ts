/**
 * Rough difficulty check: a bot taps at human speed and records how long it
 * takes to get every pixel into each share of the board. It favours taps that
 * shrink the reachable area most (closing doorways, sealing empty pockets),
 * then cells against walls, and frees any pixel it traps on its next tap.
 *
 *   npx vite-node scripts/balance.ts [seeds=12] [tuning JSON, e.g. '{"roomMaxCells":16}']
 */
import { EMPTY, PLACED, floodFill, generateLevel, type Tuning } from "../src/game/level";
import { advance, cellOf, createGame, tap, type Game } from "../src/game/sim";

const TAP_EVERY = 0.45; // seconds between taps
const LAG = 0.25; // seconds between choosing a cell and the tap landing
const LIMIT = 900;
const MARKS = [0.5, 0.3, 0.2, 0.15, 0.1];

function areaWith(game: Game, i: number): number {
  const cells = game.cells.slice();
  cells[i] = PLACED;
  const starts = game.pixels.map((p) => (p.stuckIn >= 0 ? p.stuckIn : cellOf(game, p)));
  return floodFill(cells, game.cols, game.rows, starts, () => {});
}

function choose(game: Game): number {
  const busy = new Set<number>();
  for (const p of game.pixels) {
    busy.add(cellOf(game, p));
    // Where it will be when the tap lands, ignoring bounces.
    busy.add(cellOf(game, { x: p.x + p.vx * LAG, y: p.y + p.vy * LAG }));
  }
  let best = -1;
  let bestScore = -Infinity;
  for (let i = 0; i < game.cells.length; i++) {
    if (game.cells[i] !== EMPTY || !game.reachable[i] || busy.has(i)) continue;
    const c = i % game.cols;
    const r = (i - c) / game.cols;
    let solid = 0;
    for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nc = c + dc, nr = r + dr;
      if (nc < 0 || nr < 0 || nc >= game.cols || nr >= game.rows || game.cells[nr * game.cols + nc] !== EMPTY) solid++;
    }
    const score = (game.area - areaWith(game, i)) * 10 + solid + Math.random() * 0.5;
    if (score > bestScore) {
      bestScore = score;
      best = i;
    }
  }
  return best;
}

function play(seed: number, tuning: Partial<Tuning>) {
  const level = generateLevel(seed, tuning);
  const game = createGame(level);
  const hit: Record<number, { t: number; moves: number }> = {};
  let t = 0;
  while (t < LIMIT && Object.keys(hit).length < MARKS.length) {
    let target: number;
    if (game.stuck) {
      target = game.pixels.find((p) => p.stuckIn >= 0)!.stuckIn;
    } else {
      target = choose(game);
      advance(game, LAG);
      t += LAG;
    }
    if (target >= 0) tap(game, target % game.cols, Math.floor(target / game.cols));
    for (const m of MARKS) {
      if (!hit[m] && !game.stuck && game.area <= Math.floor(game.openCells * m)) hit[m] = { t, moves: game.moves };
    }
    game.won = false; // keep going past the real threshold
    advance(game, TAP_EVERY);
    t += TAP_EVERY;
  }
  return hit;
}

const seeds = Number(process.argv[2] ?? 12);
const tuning: Partial<Tuning> = JSON.parse(process.argv[3] ?? "{}");
const rows: Record<number, { t: number[]; moves: number[]; fails: number }> = {};
for (const m of MARKS) rows[m] = { t: [], moves: [], fails: 0 };
for (let s = 1; s <= seeds; s++) {
  const hit = play(s * 7919, tuning);
  for (const m of MARKS) {
    if (hit[m]) {
      rows[m].t.push(hit[m].t);
      rows[m].moves.push(hit[m].moves);
    } else rows[m].fails++;
  }
}
const median = (a: number[]) => (a.length ? [...a].sort((x, y) => x - y)[Math.floor(a.length / 2)] : NaN);
console.log(`${JSON.stringify(tuning)}, ${seeds} boards (median, unsolved within ${LIMIT}s)`);
for (const m of MARKS) {
  const r = rows[m];
  console.log(`  ≤${String(m * 100).padStart(2)}%: ${median(r.t).toFixed(0).padStart(4)}s  ${String(median(r.moves)).padStart(4)} moves  score ${(median(r.t) * median(r.moves)).toFixed(0).padStart(7)}  unsolved ${r.fails}`);
}
