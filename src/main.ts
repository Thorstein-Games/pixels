import "./style.css";
import { WIN_AREA_RATIO } from "./game/config";
import { generateLevel, type Level } from "./game/level";
import { advance, createGame, tap, type Game } from "./game/sim";
import { createAnim, draw, type CellAnim } from "./render";
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
import { formatNumber, formatTime, score } from "./score";
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
  restartBtn: $<HTMLButtonElement>("restart-btn"),
  newBtn: $<HTMLButtonElement>("new-btn"),
  help: $<HTMLDialogElement>("help"),
  confirmRestart: $<HTMLDialogElement>("confirm-restart"),
  confirmText: $("confirm-text"),
  toast: $("toast"),
};

const goalPct = `${Math.round(WIN_AREA_RATIO * 100)}%`;
for (const id of ["start-goal", "help-goal"]) $(id).textContent = goalPct;
ui.goalText.textContent = `· goal ${goalPct}`;
ui.meterGoal.style.left = `${WIN_AREA_RATIO * 100}%`;

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
  result: null as DailyResult | null,
  cell: 20,
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
  newGame(generateLevel(dailySeed(state.key)));
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

function setupPractice(seed = (Math.random() * 2 ** 32) >>> 0) {
  newGame(generateLevel(seed));
  state.running = false;
  state.ambient = false;
  state.result = null;
  state.elapsedMs = 0;
  state.moveOffset = 0;
  ui.startKicker.textContent = "Practice";
  ui.winKicker.textContent = "Practice";
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

function onTap(e: PointerEvent) {
  if (!state.running) return;
  const rect = canvas.getBoundingClientRect();
  const c = Math.floor((e.clientX - rect.left - canvas.clientLeft) / state.cell);
  const r = Math.floor((e.clientY - rect.top - canvas.clientTop) / state.cell);
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
  countUp(ui.winScore, result.score, duration + 400, 300, formatNumber);
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
  ui.score.textContent = formatNumber(score(moves, state.elapsedMs));
  const pct = (g.area / g.openCells) * 100;
  ui.meterFill.style.width = `${Math.min(100, pct)}%`;
  ui.meterFill.classList.toggle("ok", pct <= WIN_AREA_RATIO * 100);
  ui.areaText.textContent = `Pixels can reach ${Math.round(pct)}%`;
  ui.stuckNote.hidden = g.stuck === 0;
  ui.stuckNote.textContent = g.stuck === 1 ? "1 pixel stuck!" : `${g.stuck} pixels stuck!`;
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
  const border = 4;
  const { cols, rows } = state.game;
  const cell = Math.max(
    8,
    Math.min(40, Math.floor(Math.min((wrap.clientWidth - border) / cols, (wrap.clientHeight - border) / rows))),
  );
  state.cell = cell;
  const dpr = window.devicePixelRatio || 1;
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
  draw(ctx, state.game, state.cell, now, state.anim, state.wonAt);
  requestAnimationFrame(frame);
}

canvas.addEventListener("pointerdown", onTap);
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
ui.winNext.addEventListener("click", () => {
  if (state.mode === "daily") location.hash = "practice";
  else setupPractice();
});
$("help-btn").addEventListener("click", () => ui.help.showModal());
for (const b of document.querySelectorAll<HTMLButtonElement>(".mode")) {
  b.addEventListener("click", () => {
    location.hash = b.dataset.mode === "practice" ? "practice" : "";
  });
}
window.addEventListener("hashchange", () => setMode(location.hash === "#practice" ? "practice" : "daily"));
window.addEventListener("resize", resize);
document.addEventListener("visibilitychange", () => {
  if (document.hidden) persist();
});
window.addEventListener("pagehide", persist);

setMode(location.hash === "#practice" ? "practice" : "daily");
resize();
requestAnimationFrame(frame);
