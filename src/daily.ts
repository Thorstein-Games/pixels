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
