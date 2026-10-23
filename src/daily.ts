import { hashString } from "./game/rng";

/** Day #1. */
export const LAUNCH_KEY = "2026-10-16";

export interface DailyResult {
  timeMs: number;
  moves: number;
  score: number;
}

export interface DailyStats {
  played: number;
  streak: number;
  bestStreak: number;
  lastSolvedKey: string | null;
}

/** Unsolved progress on today's board: the clock and moves survive reloads. */
export interface DailyProgress {
  key: string;
  elapsedMs: number;
  moves: number;
}

const STATS = "pixels.daily.stats";
const RESULTS = "pixels.daily.results";
const PROGRESS = "pixels.daily.progress";

/** The player's local date as YYYY-MM-DD. */
export function dateKey(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function dayNumber(key: string): number {
  const [y, m, d] = key.split("-").map(Number);
  return Math.round(Date.UTC(y, m - 1, d) / 86_400_000);
}

export function addDays(key: string, days: number): string {
  const t = new Date((dayNumber(key) + days) * 86_400_000);
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

export function puzzleNumber(key: string): number {
  return dayNumber(key) - dayNumber(LAUNCH_KEY) + 1;
}

export function dailySeed(key: string): number {
  return hashString(`pixels:${key}`);
}

/** Records a solve. Solving again on a day already counted changes nothing. */
export function recordSolve(stats: DailyStats, key: string): DailyStats {
  if (stats.lastSolvedKey === key) return stats;
  const streak = stats.lastSolvedKey === addDays(key, -1) ? stats.streak + 1 : 1;
  return {
    played: stats.played + 1,
    streak,
    bestStreak: Math.max(stats.bestStreak, streak),
    lastSolvedKey: key,
  };
}

/** The streak as of `today`: it lapses once a whole day passes unsolved. */
export function currentStreak(stats: DailyStats, today: string): number {
  const last = stats.lastSolvedKey;
  return last === today || last === addDays(today, -1) ? stats.streak : 0;
}

export const emptyStats: DailyStats = { played: 0, streak: 0, bestStreak: 0, lastSolvedKey: null };

function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? { ...fallback, ...JSON.parse(raw) } : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Private mode or full storage: the game still plays, it just won't remember.
  }
}

export const loadStats = () => read<DailyStats>(STATS, emptyStats);
export const saveStats = (s: DailyStats) => write(STATS, s);

export function loadResult(key: string): DailyResult | null {
  return read<Record<string, DailyResult>>(RESULTS, {})[key] ?? null;
}

export function saveResult(key: string, result: DailyResult) {
  write(RESULTS, { ...read<Record<string, DailyResult>>(RESULTS, {}), [key]: result });
}

export function loadProgress(key: string): DailyProgress | null {
  const p = read<DailyProgress | null>(PROGRESS, null);
  return p && p.key === key ? p : null;
}

export const saveProgress = (p: DailyProgress) => write(PROGRESS, p);
export function clearProgress() {
  try {
    localStorage.removeItem(PROGRESS);
  } catch {
    // ignore
  }
}

/* ---- cloud saves (Thorstein Games accounts, see main.ts) ---- */

/** The progress that follows a signed-in player to other devices. Today's unfinished board stays per device. */
export const SYNC_KEYS = [STATS, RESULTS];

const isResult = (r: unknown): r is DailyResult =>
  !!r && typeof r === "object" && ["timeMs", "moves", "score"].every((k) => Number.isFinite((r as Record<string, unknown>)[k]));
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function asResults(v: unknown): Record<string, DailyResult> {
  const out: Record<string, DailyResult> = {};
  if (v && typeof v === "object") {
    for (const [k, r] of Object.entries(v)) if (DATE.test(k) && isResult(r)) out[k] = r;
  }
  return out;
}

function asStats(v: unknown): DailyStats {
  const s = (v && typeof v === "object" ? v : {}) as Record<string, unknown>;
  const n = (x: unknown) => (typeof x === "number" && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
  return {
    played: n(s.played),
    streak: n(s.streak),
    bestStreak: n(s.bestStreak),
    lastSolvedKey: typeof s.lastSolvedKey === "string" && DATE.test(s.lastSolvedKey) ? s.lastSolvedKey : null,
  };
}

/**
 * Combines two devices' saved progress ({ localStorage key: parsed value }).
 * Keeps every solved day (the better score when both solved it) and works
 * the stats out again from them, so a streak played half on a phone and
 * half on a laptop joins up. Order doesn't matter: merge(a, b) = merge(b, a).
 */
export function mergeSaves(a: Record<string, unknown>, b: Record<string, unknown>): Record<string, unknown> {
  const ra = asResults(a[RESULTS]);
  const rb = asResults(b[RESULTS]);
  const results: Record<string, DailyResult> = {};
  for (const key of [...new Set([...Object.keys(ra), ...Object.keys(rb)])].sort()) {
    const x = ra[key];
    const y = rb[key];
    // Lower score wins; ties go to the faster time, then fewer moves.
    results[key] =
      !x || !y ? x || y : [x, y].sort((p, q) => p.score - q.score || p.timeMs - q.timeMs || p.moves - q.moves)[0];
  }

  const sa = asStats(a[STATS]);
  const sb = asStats(b[STATS]);
  const days = Object.keys(results);
  const last = [sa.lastSolvedKey, sb.lastSolvedKey, days[days.length - 1]].filter((k): k is string => !!k).sort().pop() ?? null;

  // Runs of consecutive solved days.
  let best = 0;
  let run = 0;
  let runAtLast = 0;
  days.forEach((key, i) => {
    run = i > 0 && addDays(days[i - 1], 1) === key ? run + 1 : 1;
    best = Math.max(best, run);
    if (key === last) runAtLast = run;
  });
  // A device's own count still counts where its results don't go back as far.
  const own = (s: DailyStats) => (s.lastSolvedKey === last ? s.streak : 0);
  const streak = Math.max(runAtLast, own(sa), own(sb));

  const stats: DailyStats = {
    played: Math.max(sa.played, sb.played, days.length),
    streak,
    bestStreak: Math.max(sa.bestStreak, sb.bestStreak, best, streak),
    lastSolvedKey: last,
  };
  const out: Record<string, unknown> = {};
  if (a[STATS] !== undefined || b[STATS] !== undefined || days.length) out[STATS] = stats;
  if (a[RESULTS] !== undefined || b[RESULTS] !== undefined) out[RESULTS] = results;
  return out;
}
