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

/** How the pixels are drawn: plain dots, or winged pixies leaving sparkles. */
export type Look = "classic" | "pixie";

interface Sparkle {
  /** Board coordinates, in cells. */
  x: number;
  y: number;
  born: number;
  color: string;
}

/** Per-game animation state: squares popping in and out, and sparkles. */
export interface CellAnim {
  placedAt: Map<number, number>;
  removedAt: Map<number, number>;
  sparkles: Sparkle[];
  lastFrame: number | null;
}

export function createAnim(): CellAnim {
  return { placedAt: new Map(), removedAt: new Map(), sparkles: [], lastFrame: null };
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
  look: Look = "classic",
  /** Pixels are moving this frame (not paused, not on the start screen). */
  moving = true,
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
  if (look === "pixie") {
    drawPixies(ctx, game, cell, now, anim, wonAt, size, glow, moving);
    return;
  }
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

const SPARKLE_COLORS = ["#ffe27a", "#ff9cf0"];
/** Average gap between sparkles from one moving pixie, and how long each lasts. */
const SPARKLE_EVERY_MS = 150;
const SPARKLE_LIFE_MS = 420;

let haloSprite: HTMLCanvasElement | null = null;
/** A soft round glow, drawn once and stamped under every pixie. */
function halo(): HTMLCanvasElement {
  if (haloSprite) return haloSprite;
  const c = document.createElement("canvas");
  c.width = c.height = 32;
  const g = c.getContext("2d")!;
  const grad = g.createRadialGradient(16, 16, 0, 16, 16, 16);
  grad.addColorStop(0, "rgba(255, 255, 255, 0.9)");
  grad.addColorStop(1, "rgba(255, 255, 255, 0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 32, 32);
  return (haloSprite = c);
}

/**
 * Pixies: each pixel gets a soft glow and a pair of flapping wings, and
 * moving ones shed short-lived sparkles behind them. Sparkles are faint and
 * brief so the board stays readable; trapped pixies stop flapping and shake.
 */
function drawPixies(
  ctx: CanvasRenderingContext2D,
  game: Game,
  cell: number,
  now: number,
  anim: CellAnim,
  wonAt: number | null,
  size: number,
  glow: number,
  moving: boolean,
) {
  const dt = anim.lastFrame === null ? 0 : Math.min(100, now - anim.lastFrame);
  anim.lastFrame = now;

  // Shed new sparkles (only while pixies move), retire old ones.
  if (moving && wonAt === null && dt > 0) {
    const chance = dt / SPARKLE_EVERY_MS;
    for (const p of game.pixels) {
      if (p.stuckIn >= 0 || Math.random() > chance) continue;
      anim.sparkles.push({
        x: p.x - p.vx * 0.06 + (Math.random() - 0.5) * 0.25,
        y: p.y - p.vy * 0.06 + (Math.random() - 0.5) * 0.25,
        born: now,
        color: SPARKLE_COLORS[(Math.random() * SPARKLE_COLORS.length) | 0],
      });
    }
  }
  anim.sparkles = anim.sparkles.filter((s) => now - s.born < SPARKLE_LIFE_MS);
  for (const s of anim.sparkles) {
    const t = (now - s.born) / SPARKLE_LIFE_MS;
    const arm = Math.max(1, Math.round(size * (1 - t) * 0.9));
    const x = Math.round(s.x * cell);
    const y = Math.round(s.y * cell);
    ctx.globalAlpha = 0.5 * (1 - t);
    ctx.fillStyle = s.color;
    // A tiny pixel-art twinkle: a plus sign that shrinks as it fades.
    ctx.fillRect(x - arm, y, arm * 2 + 1, 1);
    ctx.fillRect(x, y - arm, 1, arm * 2 + 1);
  }
  ctx.globalAlpha = 1;

  const half = size / 2;
  const wing = Math.max(1, Math.round(size * 0.75));
  const sprite = halo();
  game.pixels.forEach((p, i) => {
    let x = p.x * cell;
    let y = p.y * cell;
    const stuck = p.stuckIn >= 0;
    if (stuck) {
      x += Math.sin(now / 23 + p.vx * 50) * 1.5;
      y += Math.cos(now / 19 + p.vy * 50) * 1.5;
    }
    const body = stuck ? COLORS.stuck : wonAt === null ? COLORS.pixel : COLORS.won;
    const r = size * (2.2 + glow);
    ctx.globalAlpha = stuck ? 0.25 : 0.28 + 0.3 * glow;
    ctx.drawImage(sprite, x - r, y - r, r * 2, r * 2);

    // Wings flap out of step with each other; trapped pixies hold them down.
    const up = !stuck && Math.sin(now / 55 + i * 1.7) > 0;
    const wy = Math.round(y - half - (up ? wing : wing * 0.35));
    ctx.globalAlpha = stuck ? 0.35 : 0.6;
    ctx.fillStyle = "#e9fbff";
    ctx.fillRect(Math.round(x - half - wing), wy, wing, wing);
    ctx.fillRect(Math.round(x + half), wy, wing, wing);

    ctx.globalAlpha = 1;
    ctx.fillStyle = body;
    ctx.fillRect(Math.round(x - half), Math.round(y - half), size, size);
  });
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
