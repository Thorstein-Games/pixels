import "./style.css";
import { WIN_AREA_PERCENT } from "./game/config";
import { generateLevel, type Level } from "./game/level";
import { advance, createGame, reachPercent, tap, winArea, type Game } from "./game/sim";
import { createAnim, draw, type CellAnim, type Look } from "./render";

/** Pixies by default; `?look=classic` draws plain dots instead. */
const look: Look = new URLSearchParams(location.search).get("look") === "classic" ? "classic" : "pixie";
import {
  clearProgress,
  currentStreak,
  dailySeed,
  dateKey,
  loadProgress,
  loadResult,
  loadStats,
  puzzleNumber,
  recordSolve,
  saveProgress,
  saveResult,
  saveStats,
  type DailyResult,
} from "./daily";
import { formatNumber, formatTime, score, scoreHeat } from "./score";
import { shareText } from "./share";

type Mode = "daily" | "practice";

const $ = <T extends HTMLElement>(id: string) => document.getElementById(id) as T;
const canvas = $<HTMLCanvasElement>("board");
const ctx = canvas.getContext("2d")!;
const ui = {
  time: $("time"),
  moves: $("moves"),
  score: $("score"),
  meterFill: $("meter-fill"),
  meterGoal: $("meter-goal"),
  areaText: $("area-text"),
  goalText: $("goal-text"),
  stuckNote: $("stuck-note"),
  startOverlay: $("start-overlay"),
  startKicker: $("start-kicker"),
  startBtn: $<HTMLButtonElement>("start-btn"),
  winOverlay: $("win-overlay"),
  winKicker: $("win-kicker"),
  winTime: $("win-time"),
  winMoves: $("win-moves"),
  winScore: $("win-score"),
  winExtra: $("win-extra"),
  shareBtn: $<HTMLButtonElement>("share-btn"),
  winNext: $<HTMLButtonElement>("win-next"),
  playAgain: $<HTMLButtonElement>("play-again"),
  restartBtn: $<HTMLButtonElement>("restart-btn"),
  newBtn: $<HTMLButtonElement>("new-btn"),
  help: $<HTMLDialogElement>("help"),
  confirmRestart: $<HTMLDialogElement>("confirm-restart"),
  confirmText: $("confirm-text"),
  toast: $("toast"),
};

const goalPct = `${WIN_AREA_PERCENT}%`;
for (const id of ["start-goal", "help-goal"]) $(id).textContent = goalPct;
ui.goalText.textContent = `· goal ${goalPct}`;
ui.meterGoal.style.left = `${WIN_AREA_PERCENT}%`;

const state = {
  mode: "daily" as Mode,
  key: dateKey(),
  level: null as unknown as Level,
  game: null as unknown as Game,
  anim: createAnim() as CellAnim,
  /** Pixels are moving and the clock is counting. */
  running: false,
  /** Pixels drift behind the solved card without a clock. */
  ambient: false,
  elapsedMs: 0,
  /** Moves from earlier attempts at today's board (restarts, reloads). */
  moveOffset: 0,
  wonAt: null as number | null,
  /** Seed of the board being played, for "Play again". */
  seed: 0,
  result: null as DailyResult | null,
  cell: 20,
  /** Cell the pointer is over (hover, or a press being aimed). */
  aim: null as number | null,
  /** When the current press started, for fading in its aim guides. */
  pressedAt: null as number | null,
};

// Lets the e2e tests drive the game without pixel-perfect taps.
(window as unknown as { __pixels: typeof state }).__pixels = state;

const totalMoves = () => state.moveOffset + state.game.moves;

function newGame(level: Level) {
  state.level = level;
  state.game = createGame(level);
  state.anim = createAnim();
  state.wonAt = null;
}

function setMode(mode: Mode) {
  persist();
  state.mode = mode;
  for (const b of document.querySelectorAll<HTMLButtonElement>(".mode")) {
    b.setAttribute("aria-pressed", String(b.dataset.mode === mode));
  }
  ui.newBtn.hidden = mode !== "practice";
  if (mode === "daily") setupDaily();
  else setupPractice();
}

function setupDaily() {
  state.key = dateKey();
  state.seed = dailySeed(state.key);
  newGame(generateLevel(state.seed));
  state.running = false;
  state.result = loadResult(state.key);
  const label = `Daily #${puzzleNumber(state.key)}`;
  ui.startKicker.textContent = label;
  ui.winKicker.textContent = label;
  if (state.result) {
    state.ambient = true;
    state.elapsedMs = state.result.timeMs;
    state.moveOffset = state.result.moves;
    ui.startOverlay.hidden = true;
    ui.restartBtn.hidden = true;
    showWin(state.result, false);
  } else {
    const progress = loadProgress(state.key);
    state.ambient = false;
    state.elapsedMs = progress?.elapsedMs ?? 0;
    state.moveOffset = progress?.moves ?? 0;
    ui.startBtn.textContent = progress ? "Continue" : "Start";
    ui.startOverlay.hidden = false;
    ui.winOverlay.hidden = true;
    ui.restartBtn.hidden = false;
  }
  updateHud();
}

/** A board that's never recorded: a random one, or a replay of `seed`. */
function setupPractice(seed = (Math.random() * 2 ** 32) >>> 0, label = "Practice") {
  state.seed = seed;
  newGame(generateLevel(seed));
  state.running = false;
  state.ambient = false;
  state.result = null;
  state.elapsedMs = 0;
  state.moveOffset = 0;
  ui.startKicker.textContent = label;
  ui.winKicker.textContent = label;
  ui.startBtn.textContent = "Start";
  ui.startOverlay.hidden = false;
  ui.winOverlay.hidden = true;
  ui.restartBtn.hidden = false;
  updateHud();
}

function start() {
  ui.startOverlay.hidden = true;
  state.running = true;
}

function restart() {
  if (state.mode === "daily") {
    // A fresh board, but the clock and moves carry on.
    state.moveOffset = totalMoves();
    newGame(state.level);
    persist();
  } else {
    newGame(state.level);
    state.elapsedMs = 0;
    state.moveOffset = 0;
    state.running = false;
    ui.winOverlay.hidden = true;
    ui.startOverlay.hidden = false;
  }
  updateHud();
}

function persist() {
  if (state.mode !== "daily" || state.result || !state.running) return;
  saveProgress({ key: state.key, elapsedMs: state.elapsedMs, moves: totalMoves() });
}

/** The board cell under a pointer, or null when it's off the board. */
function cellAt(e: PointerEvent): number | null {
  const rect = canvas.getBoundingClientRect();
  const c = Math.floor((e.clientX - rect.left - canvas.clientLeft) / state.cell);
  const r = Math.floor((e.clientY - rect.top - canvas.clientTop) / state.cell);
  const { cols, rows } = state.game;
  return c >= 0 && r >= 0 && c < cols && r < rows ? r * cols + c : null;
}

/**
 * Blocks go down when the finger lifts, not when it lands: pressing shows
 * where the block will go, dragging moves it, and lifting off the board
 * cancels. A quick tap works as before.
 */
let pressId: number | null = null;
function onPointerDown(e: PointerEvent) {
  if (!state.running || pressId !== null) return;
  e.preventDefault();
  pressId = e.pointerId;
  canvas.setPointerCapture(e.pointerId);
  state.aim = cellAt(e);
  state.pressedAt = performance.now();
}

function onPointerMove(e: PointerEvent) {
  if (pressId === e.pointerId || e.pointerType === "mouse") state.aim = cellAt(e);
}

function onPointerUp(e: PointerEvent) {
  if (pressId !== e.pointerId) return;
  pressId = null;
  state.pressedAt = null;
  const i = cellAt(e);
  state.aim = e.pointerType === "mouse" ? i : null;
  if (i !== null && state.running) place(i % state.game.cols, Math.floor(i / state.game.cols));
}

function onPointerCancel(e: PointerEvent) {
  if (pressId === e.pointerId) pressId = null;
  state.pressedAt = null;
  state.aim = null;
}

function place(c: number, r: number) {
  const stuckBefore = state.game.stuck;
  const result = tap(state.game, c, r);
  if (result === "none" || result === "blocked") return;
  const i = r * state.game.cols + c;
  const now = performance.now();
  if (result === "placed") state.anim.placedAt.set(i, now);
  else state.anim.removedAt.set(i, now);
  if (state.game.stuck > stuckBefore) navigator.vibrate?.(30);
  bump(ui.moves);
  updateHud();
  if (state.game.won) win();
  else persist();
}

function win() {
  state.running = false;
  state.wonAt = performance.now();
  const result: DailyResult = {
    timeMs: Math.round(state.elapsedMs),
    moves: totalMoves(),
    score: score(totalMoves(), state.elapsedMs),
  };
  if (state.mode === "daily") {
    state.result = result;
    saveResult(state.key, result);
    saveStats(recordSolve(loadStats(), state.key));
    clearProgress();
    ui.restartBtn.hidden = true;
  }
  updateHud();
  // Let the trapped pixels glow for a moment before the card covers them.
  setTimeout(() => showWin(result, true), 900);
}

function showWin(result: DailyResult, animate: boolean) {
  const daily = state.mode === "daily";
  ui.shareBtn.hidden = !daily;
  ui.winNext.textContent = daily ? "Practice" : "New board";
  ui.winExtra.textContent = daily ? dailyExtra() : "";
  ui.winOverlay.hidden = false;
  const duration = animate ? 900 : 0;
  countUp(ui.winTime, result.timeMs, duration, 0, formatTime);
  countUp(ui.winMoves, result.moves, duration, 150, String);
  // No count-up when reopening a solved daily: show the numbers straight away.
  countUp(ui.winScore, result.score, animate ? duration + 400 : 0, 300, formatNumber);
}

function dailyExtra(): string {
  const stats = loadStats();
  const streak = currentStreak(stats, state.key);
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  const mins = Math.max(0, Math.ceil((midnight.getTime() - Date.now()) / 60000));
  return `🔥 Streak ${streak} · Best ${stats.bestStreak} · Next puzzle in ${Math.floor(mins / 60)}h ${mins % 60}m`;
}

function countUp(
  el: HTMLElement,
  target: number,
  duration: number,
  delay: number,
  fmt: (n: number) => string,
) {
  if (duration <= 0) {
    el.textContent = fmt(target);
    return;
  }
  el.textContent = fmt(0);
  const t0 = performance.now() + delay;
  const tick = (now: number) => {
    const t = Math.min(1, Math.max(0, (now - t0) / duration));
    const eased = 1 - (1 - t) ** 3;
    el.textContent = fmt(Math.round(target * eased));
    if (t < 1) requestAnimationFrame(tick);
    else bump(el);
  };
  requestAnimationFrame(tick);
}

function bump(el: HTMLElement) {
  el.classList.remove("bump");
  void el.offsetWidth;
  el.classList.add("bump");
}

let lastHud = "";
function updateHud() {
  const g = state.game;
  const moves = totalMoves();
  const hud = `${formatTime(state.elapsedMs)}|${moves}|${score(moves, state.elapsedMs)}|${g.area}|${g.stuck}`;
  if (hud === lastHud) return;
  lastHud = hud;
  ui.time.textContent = formatTime(state.elapsedMs);
  ui.moves.textContent = String(moves);
  const current = score(moves, state.elapsedMs);
  ui.score.textContent = formatNumber(current);
  ui.score.dataset.heat = scoreHeat(current);
  ui.meterFill.style.width = `${Math.min(100, (g.area / g.openCells) * 100)}%`;
  ui.meterFill.classList.toggle("ok", g.area <= winArea(g));
  ui.areaText.textContent = `Pixies can reach ${reachPercent(g)}%`;
  // The stuck warning takes over the meter's line while it lasts, so it
  // sits outside the board and never shifts the layout.
  const stuck = g.stuck > 0;
  ui.stuckNote.hidden = !stuck;
  ui.areaText.hidden = stuck;
  ui.goalText.hidden = stuck;
  ui.stuckNote.textContent = `${g.stuck === 1 ? "1 pixie" : `${g.stuck} pixies`} stuck! Tap the block to free ${g.stuck === 1 ? "it" : "them"}.`;
}

function showToast(text: string) {
  ui.toast.textContent = text;
  ui.toast.classList.add("show");
  setTimeout(() => ui.toast.classList.remove("show"), 1600);
}

async function share() {
  if (!state.result) return;
  const text = shareText(puzzleNumber(state.key), state.result, currentStreak(loadStats(), state.key));
  try {
    if (navigator.share && matchMedia("(pointer: coarse)").matches) {
      await navigator.share({ text });
      return;
    }
    await navigator.clipboard.writeText(text);
    showToast("Copied to clipboard");
  } catch {
    // Share sheet dismissed, or clipboard blocked.
  }
}

function resize() {
  const wrap = $("board-wrap");
  // Both sides of the canvas border, which is thinner on small phones.
  const border = canvas.offsetWidth - canvas.clientWidth;
  const { cols, rows } = state.game;
  const cell = Math.max(
    8,
    Math.min(72, Math.floor(Math.min((wrap.clientWidth - border) / cols, (wrap.clientHeight - border) / rows))),
  );
  const dpr = window.devicePixelRatio || 1;
  // Setting canvas.width clears it, so only do it when the size really changes.
  if (cell === state.cell && canvas.width === Math.round(cols * cell * dpr) && canvas.height === Math.round(rows * cell * dpr)) return;
  state.cell = cell;
  canvas.style.width = `${cols * cell}px`;
  canvas.style.height = `${rows * cell}px`;
  canvas.width = Math.round(cols * cell * dpr);
  canvas.height = Math.round(rows * cell * dpr);
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

let last = performance.now();
let lastSave = 0;
function frame(now: number) {
  const dt = Math.min(now - last, 250);
  last = now;
  // Pause behind the help and restart dialogs as well as in hidden tabs.
  const paused = document.hidden || document.querySelector("dialog[open]") !== null;
  if ((state.running || state.ambient) && !paused) {
    advance(state.game, dt / 1000);
    if (state.running) {
      state.elapsedMs += dt;
      if (now - lastSave > 5000) {
        lastSave = now;
        persist();
      }
    }
    updateHud();
  }
  draw(
    ctx,
    state.game,
    state.cell,
    now,
    state.anim,
    state.wonAt,
    state.running ? state.aim : null,
    state.pressedAt === null ? null : now - state.pressedAt,
    look,
    (state.running || state.ambient) && !paused,
  );
  requestAnimationFrame(frame);
}

canvas.addEventListener("pointerdown", onPointerDown);
canvas.addEventListener("pointermove", onPointerMove);
canvas.addEventListener("pointerup", onPointerUp);
canvas.addEventListener("pointercancel", onPointerCancel);
canvas.addEventListener("pointerleave", (e) => {
  if (e.pointerType === "mouse" && pressId === null) state.aim = null;
});
// iOS Safari still zooms on quick double taps unless the touches are eaten.
canvas.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
document.addEventListener("dblclick", (e) => e.preventDefault());
ui.startBtn.addEventListener("click", start);
ui.restartBtn.addEventListener("click", () => {
  if (!state.running && totalMoves() === 0) return restart();
  ui.confirmText.textContent =
    state.mode === "daily"
      ? "The board resets. Your time and moves keep counting."
      : "The board resets, along with your time and moves.";
  ui.confirmRestart.returnValue = "";
  ui.confirmRestart.showModal();
});
ui.confirmRestart.addEventListener("close", () => {
  if (ui.confirmRestart.returnValue === "restart") restart();
});
ui.newBtn.addEventListener("click", () => setupPractice());
ui.shareBtn.addEventListener("click", share);
ui.playAgain.addEventListener("click", () => {
  if (state.mode === "daily") {
    // Today's board again, just for fun: the saved result and streak stay.
    state.mode = "practice";
    ui.newBtn.hidden = false;
    for (const b of document.querySelectorAll<HTMLButtonElement>(".mode")) {
      b.setAttribute("aria-pressed", String(b.dataset.mode === "practice"));
    }
    setupPractice(state.seed, `Daily #${puzzleNumber(state.key)} · replay`);
  } else {
    setupPractice(state.seed, ui.winKicker.textContent ?? "Practice");
  }
});
ui.winNext.addEventListener("click", () => {
  if (state.mode === "daily") location.hash = "practice";
  else setupPractice();
});
$("help-btn").addEventListener("click", () => ui.help.showModal());
for (const b of document.querySelectorAll<HTMLButtonElement>(".mode")) {
  b.addEventListener("click", () => {
    const hash = b.dataset.mode === "practice" ? "#practice" : "";
    // A daily replay runs as practice under the daily URL, so the hash may
    // already match: switch directly then, as no hashchange will fire.
    if (location.hash === hash) setMode(b.dataset.mode === "practice" ? "practice" : "daily");
    else location.hash = hash;
  });
}
window.addEventListener("hashchange", () => setMode(location.hash === "#practice" ? "practice" : "daily"));
// Refit whenever the space for the board changes (rotation, browser bars,
// late layout), not just on window resize.
new ResizeObserver(resize).observe($("board-wrap"));
document.addEventListener("visibilitychange", () => {
  if (document.hidden) persist();
});
window.addEventListener("pagehide", persist);

setMode(location.hash === "#practice" ? "practice" : "daily");
resize();
requestAnimationFrame(frame);
