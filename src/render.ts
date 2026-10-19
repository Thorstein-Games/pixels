import { EMPTY, PLACED, WALL } from "./game/level";
import type { Game } from "./game/sim";

const COLORS = {
  board: "#141722",
  sealed: "#0b0d13",
  grid: "#1e2231",
  wall: "#3b4160",
  wallEdge: "#4c5378",
  placed: "#f5b83d",
  placedEdge: "#ffd77a",
  pixel: "#8ff3ff",
  stuck: "#ff5c70",
  won: "#a4ffb0",
};

/** Draws squares popping in and out, keyed by cell index. */
export interface CellAnim {
  placedAt: Map<number, number>;
  removedAt: Map<number, number>;
}

export function createAnim(): CellAnim {
  return { placedAt: new Map(), removedAt: new Map() };
}

const POP_MS = 180;

export function draw(
  ctx: CanvasRenderingContext2D,
  game: Game,
  cell: number,
  now: number,
  anim: CellAnim,
  wonAt: number | null,
  aim: number | null = null,
  /** Milliseconds the current press has been held, or null when not pressing. */
  pressAge: number | null = null,
) {
  const { cols, rows, cells, reachable } = game;
  const w = cols * cell;
  const h = rows * cell;
  ctx.fillStyle = COLORS.board;
  ctx.fillRect(0, 0, w, h);

  // Empty cells no pixel can reach any more go dark: that's progress.
  ctx.fillStyle = COLORS.sealed;
  for (let i = 0; i < cells.length; i++) {
    if (cells[i] === EMPTY && !reachable[i]) {
      ctx.fillRect((i % cols) * cell, Math.floor(i / cols) * cell, cell, cell);
    }
  }

  ctx.strokeStyle = COLORS.grid;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let c = 1; c < cols; c++) {
    ctx.moveTo(c * cell + 0.5, 0);
    ctx.lineTo(c * cell + 0.5, h);
  }
  for (let r = 1; r < rows; r++) {
    ctx.moveTo(0, r * cell + 0.5);
    ctx.lineTo(w, r * cell + 0.5);
  }
  ctx.stroke();

  for (let i = 0; i < cells.length; i++) {
    const x = (i % cols) * cell;
    const y = Math.floor(i / cols) * cell;
    if (cells[i] === WALL) {
      ctx.fillStyle = COLORS.wall;
      ctx.fillRect(x, y, cell, cell);
      ctx.fillStyle = COLORS.wallEdge;
      ctx.fillRect(x, y, cell, 2);
    } else if (cells[i] === PLACED) {
      const t = Math.min(1, (now - (anim.placedAt.get(i) ?? -Infinity)) / POP_MS);
      // Overshoot a little, then settle.
      const s = t >= 1 ? 1 : 0.6 + 0.55 * Math.sin((t * Math.PI) / 1.6);
      drawSquare(ctx, x, y, cell, Math.min(s, 1.12), 1);
    }
  }
  for (const [i, at] of anim.removedAt) {
    const t = (now - at) / POP_MS;
    if (t >= 1 || cells[i] !== EMPTY) {
      anim.removedAt.delete(i);
      continue;
    }
    drawSquare(ctx, (i % cols) * cell, Math.floor(i / cols) * cell, cell, 1 - 0.5 * t, 1 - t);
  }

  if (aim !== null) drawAim(ctx, game, cell, aim, pressAge);

  const size = Math.max(2, Math.round(cell / 9));
  const half = size / 2;
  const glow = wonAt === null ? 0 : 0.5 + 0.5 * Math.sin((now - wonAt) / 140);
  for (const p of game.pixels) {
    let x = p.x * cell;
    let y = p.y * cell;
    if (p.stuckIn >= 0) {
      // Shake in place until the square holding it is removed.
      x += Math.sin(now / 23 + p.vx * 50) * 1.5;
      y += Math.cos(now / 19 + p.vy * 50) * 1.5;
      ctx.fillStyle = COLORS.stuck;
    } else {
      ctx.fillStyle = wonAt === null ? COLORS.pixel : COLORS.won;
    }
    if (glow) {
      ctx.globalAlpha = 0.35 * glow;
      ctx.fillRect(x - half - 2, y - half - 2, size + 4, size + 4);
      ctx.globalAlpha = 1;
    }
    ctx.fillRect(Math.round(x - half), Math.round(y - half), size, size);
  }
}

/** A press held this long starts showing row/column guides, fading in. */
const GUIDE_DELAY_MS = 150;
const GUIDE_FADE_MS = 200;

/**
 * Marks the cell a block would go in. A press held past a quick tap also
 * fades in faint guides along that row and column, which stay visible
 * around the fingertip covering the cell itself.
 */
function drawAim(ctx: CanvasRenderingContext2D, game: Game, cell: number, aim: number, pressAge: number | null) {
  const c = aim % game.cols;
  const r = Math.floor(aim / game.cols);
  const x = c * cell;
  const y = r * cell;
  const v = game.cells[aim];
  const color = v === WALL ? "255, 92, 112" : v === PLACED ? "255, 215, 122" : "143, 243, 255";
  const fade = pressAge === null ? 0 : Math.min(1, Math.max(0, (pressAge - GUIDE_DELAY_MS) / GUIDE_FADE_MS));
  if (fade > 0) {
    ctx.fillStyle = `rgba(${color}, ${0.05 * fade})`;
    ctx.fillRect(0, y, game.cols * cell, cell);
    ctx.fillRect(x, 0, cell, game.rows * cell);
  }
  ctx.fillStyle = `rgba(${color}, ${0.15 + 0.1 * fade})`;
  ctx.fillRect(x, y, cell, cell);
  ctx.strokeStyle = `rgba(${color}, 0.9)`;
  ctx.lineWidth = 2;
  ctx.strokeRect(x + 1, y + 1, cell - 2, cell - 2);
}

function drawSquare(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  cell: number,
  scale: number,
  alpha: number,
) {
  const inset = (cell * (1 - scale)) / 2;
  const s = cell * scale;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = COLORS.placed;
  ctx.fillRect(x + inset + 1, y + inset + 1, s - 2, s - 2);
  ctx.fillStyle = COLORS.placedEdge;
  ctx.fillRect(x + inset + 1, y + inset + 1, s - 2, 2);
  ctx.globalAlpha = 1;
}
