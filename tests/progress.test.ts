import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  addDays,
  clearProgress,
  currentStreak,
  dateKey,
  emptyStats,
  loadProgress,
  loadResult,
  loadStats,
  mergeSaves,
  puzzleNumber,
  recordSolve,
  saveProgress,
  saveResult,
  saveStats,
  SYNC_KEYS,
} from "../src/daily";
import { formatNumber, formatTime, score, scoreHeat } from "../src/score";
import { GAME_NAME, SITE_URL, shareText } from "../src/share";

/** In-memory localStorage; `broken` makes every call throw, like Safari private mode. */
class MemoryStorage {
  data = new Map<string, string>();
  broken = false;
  getItem(k: string) {
    if (this.broken) throw new Error("denied");
    return this.data.has(k) ? this.data.get(k)! : null;
  }
  setItem(k: string, v: string) {
    if (this.broken) throw new Error("denied");
    this.data.set(k, String(v));
  }
  removeItem(k: string) {
    if (this.broken) throw new Error("denied");
    this.data.delete(k);
  }
}

let storage: MemoryStorage;
beforeEach(() => {
  storage = new MemoryStorage();
  (globalThis as { localStorage?: unknown }).localStorage = storage;
});
afterEach(() => {
  delete (globalThis as { localStorage?: unknown }).localStorage;
});

describe("storage keys", () => {
  it("still uses the pre-rename keys, so existing streaks survive", () => {
    saveStats({ ...emptyStats, streak: 3 });
    saveResult("2026-10-22", { timeMs: 1, moves: 1, score: 1 });
    saveProgress({ key: "2026-10-22", elapsedMs: 1, moves: 1 });
    expect([...storage.data.keys()].sort()).toEqual([
      "pixels.daily.progress",
      "pixels.daily.results",
      "pixels.daily.stats",
    ]);
  });

  it("reads data saved before the rename", () => {
    storage.data.set(
      "pixels.daily.stats",
      JSON.stringify({ played: 4, streak: 2, bestStreak: 3, lastSolvedKey: "2026-10-21" }),
    );
    expect(currentStreak(loadStats(), "2026-10-22")).toBe(2);
  });
});

describe("stats", () => {
  it("round-trips", () => {
    const stats = { played: 5, streak: 2, bestStreak: 4, lastSolvedKey: "2026-10-20" };
    saveStats(stats);
    expect(loadStats()).toEqual(stats);
  });

  it("falls back to empty stats when nothing, or garbage, is saved", () => {
    expect(loadStats()).toEqual(emptyStats);
    storage.data.set("pixels.daily.stats", "{not json");
    expect(loadStats()).toEqual(emptyStats);
  });

  it("fills in fields missing from older saves", () => {
    storage.data.set("pixels.daily.stats", JSON.stringify({ played: 2, streak: 1 }));
    expect(loadStats()).toEqual({ ...emptyStats, played: 2, streak: 1 });
  });
});

describe("results and progress", () => {
  it("keeps one result per day without overwriting other days", () => {
    saveResult("2026-10-21", { timeMs: 60_000, moves: 30, score: 1800 });
    saveResult("2026-10-22", { timeMs: 90_000, moves: 40, score: 3600 });
    expect(loadResult("2026-10-21")?.score).toBe(1800);
    expect(loadResult("2026-10-22")?.score).toBe(3600);
    expect(loadResult("2026-10-23")).toBeNull();
  });

  it("only restores progress for the same day", () => {
    saveProgress({ key: "2026-10-21", elapsedMs: 5000, moves: 3 });
    expect(loadProgress("2026-10-21")).toEqual({ key: "2026-10-21", elapsedMs: 5000, moves: 3 });
    expect(loadProgress("2026-10-22")).toBeNull();
    clearProgress();
    expect(loadProgress("2026-10-21")).toBeNull();
  });

  it("keeps working when storage is unavailable", () => {
    storage.broken = true;
    expect(() => saveStats({ ...emptyStats, streak: 1 })).not.toThrow();
    expect(() => saveResult("2026-10-22", { timeMs: 1, moves: 1, score: 1 })).not.toThrow();
    expect(() => saveProgress({ key: "2026-10-22", elapsedMs: 1, moves: 1 })).not.toThrow();
    expect(() => clearProgress()).not.toThrow();
    expect(loadStats()).toEqual(emptyStats);
    expect(loadResult("2026-10-22")).toBeNull();
    expect(loadProgress("2026-10-22")).toBeNull();
  });

  it("works with no localStorage at all", () => {
    delete (globalThis as { localStorage?: unknown }).localStorage;
    expect(loadStats()).toEqual(emptyStats);
    expect(() => saveStats(emptyStats)).not.toThrow();
  });
});

describe("dates", () => {
  it("uses the player's local date", () => {
    expect(dateKey(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(dateKey(new Date(2026, 11, 31, 0, 1))).toBe("2026-12-31");
  });

  it("adds days across months, years and leap days", () => {
    expect(addDays("2026-10-31", 1)).toBe("2026-11-01");
    expect(addDays("2026-01-01", -1)).toBe("2025-12-31");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
    expect(addDays("2027-02-28", 1)).toBe("2027-03-01");
    // DST changes don't skip or repeat days (keys are calendar dates).
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-11-01", 1)).toBe("2026-11-02");
  });

  it("numbers puzzles one per day from launch", () => {
    expect(puzzleNumber("2026-10-16")).toBe(1);
    expect(puzzleNumber("2026-10-22")).toBe(7);
    expect(puzzleNumber(addDays("2026-10-16", 365))).toBe(366);
  });
});

describe("streaks", () => {
  it("counts a run of days, keeps the best, and survives a solve on the same day twice", () => {
    let s = emptyStats;
    for (const day of ["2026-10-16", "2026-10-17", "2026-10-18"]) s = recordSolve(s, day);
    expect(s).toEqual({ played: 3, streak: 3, bestStreak: 3, lastSolvedKey: "2026-10-18" });
    expect(recordSolve(s, "2026-10-18")).toBe(s);
    s = recordSolve(s, "2026-10-21");
    expect(s).toMatchObject({ played: 4, streak: 1, bestStreak: 3 });
  });

  it("shows the streak until a whole day is missed", () => {
    const s = recordSolve(recordSolve(emptyStats, "2026-10-20"), "2026-10-21");
    expect(currentStreak(s, "2026-10-21")).toBe(2);
    expect(currentStreak(s, "2026-10-22")).toBe(2);
    expect(currentStreak(s, "2026-10-23")).toBe(0);
  });
});

describe("score", () => {
  it("is moves × seconds, rounded", () => {
    expect(score(10, 60_000)).toBe(600);
    expect(score(3, 1_500)).toBe(5);
    expect(score(0, 99_000)).toBe(0);
  });

  it("formats time as m:ss, including past an hour", () => {
    expect(formatTime(0)).toBe("0:00");
    expect(formatTime(9_999)).toBe("0:09");
    expect(formatTime(61_000)).toBe("1:01");
    expect(formatTime(3_725_000)).toBe("62:05");
  });

  it("formats big numbers with separators", () => {
    expect(formatNumber(1234567)).toBe("1,234,567");
  });

  it("heats up as it climbs", () => {
    expect(scoreHeat(0)).toBe("cool");
    expect(scoreHeat(9_999)).toBe("cool");
    expect(scoreHeat(10_000)).toBe("mild");
    expect(scoreHeat(25_000)).toBe("warm");
    expect(scoreHeat(50_000)).toBe("hot");
  });
});

describe("share text", () => {
  const result = { timeMs: 95_000, moves: 142, score: 13_490 };

  it("has the puzzle number, time, moves, score and link", () => {
    expect(shareText(7, result, 1)).toBe(
      [`${GAME_NAME} #7`, "⏱ 1:35 · 🧱 142 moves", "Score 13,490 (lower wins)", SITE_URL].join("\n"),
    );
  });

  it("adds the streak from two days on", () => {
    expect(shareText(7, result, 2)).toContain("Score 13,490 (lower wins) · 🔥 2");
  });

  it("links to the current address", () => {
    expect(SITE_URL).toBe("https://thorsteingames.com/pix-pen");
    expect(GAME_NAME).toBe("Pix Pen");
  });
});

describe("cloud saves (merging two devices)", () => {
  const STATS = "pixels.daily.stats";
  const RESULTS = "pixels.daily.results";
  const r = (score: number, timeMs = score, moves = 10) => ({ score, timeMs, moves });
  const save = (days: Record<string, number>, stats?: Partial<typeof emptyStats>) => ({
    [RESULTS]: Object.fromEntries(Object.entries(days).map(([k, v]) => [k, r(v)])),
    [STATS]: { ...emptyStats, ...stats },
  });

  it("syncs the stats and results, not today's unfinished board", () => {
    expect(SYNC_KEYS).toEqual([STATS, RESULTS]);
  });

  it("joins a streak played half on each device", () => {
    const phone = save({ "2026-10-16": 50, "2026-10-17": 60 }, { played: 2, streak: 2, bestStreak: 2, lastSolvedKey: "2026-10-17" });
    const laptop = save({ "2026-10-18": 70 }, { played: 1, streak: 1, bestStreak: 1, lastSolvedKey: "2026-10-18" });
    const merged = mergeSaves(phone, laptop);
    expect(merged[STATS]).toEqual({ played: 3, streak: 3, bestStreak: 3, lastSolvedKey: "2026-10-18" });
    expect(Object.keys(merged[RESULTS] as object)).toEqual(["2026-10-16", "2026-10-17", "2026-10-18"]);
  });

  it("keeps the better score for a day solved on both", () => {
    const merged = mergeSaves(save({ "2026-10-20": 900 }), save({ "2026-10-20": 400 }));
    expect((merged[RESULTS] as Record<string, unknown>)["2026-10-20"]).toEqual(r(400));
  });

  it("gives the same answer either way round, and again when merged with itself", () => {
    const a = save({ "2026-10-16": 5, "2026-10-18": 9, "2026-10-19": 3 }, { played: 3, streak: 2, bestStreak: 2, lastSolvedKey: "2026-10-19" });
    const b = save({ "2026-10-17": 4, "2026-10-19": 8 }, { played: 2, streak: 1, bestStreak: 1, lastSolvedKey: "2026-10-19" });
    const ab = mergeSaves(a, b);
    expect(mergeSaves(b, a)).toEqual(ab);
    expect(mergeSaves(ab, ab)).toEqual(ab);
    expect(mergeSaves(ab, a)).toEqual(ab);
    expect(ab[STATS]).toEqual({ played: 4, streak: 4, bestStreak: 4, lastSolvedKey: "2026-10-19" });
  });

  it("never loses a best streak or play count the results don't cover", () => {
    const old = save({ "2026-10-20": 5 }, { played: 30, streak: 12, bestStreak: 20, lastSolvedKey: "2026-10-20" });
    const merged = mergeSaves(old, save({}));
    expect(merged[STATS]).toEqual({ played: 30, streak: 12, bestStreak: 20, lastSolvedKey: "2026-10-20" });
  });

  it("restarts the streak after a gap, keeping the best", () => {
    const merged = mergeSaves(save({ "2026-10-16": 1, "2026-10-17": 1 }), save({ "2026-10-20": 1 }));
    expect(merged[STATS]).toMatchObject({ streak: 1, bestStreak: 2, lastSolvedKey: "2026-10-20" });
  });

  it("takes a new device's empty save, and ignores damaged data", () => {
    const a = save({ "2026-10-16": 7 }, { played: 1, streak: 1, bestStreak: 1, lastSolvedKey: "2026-10-16" });
    expect(mergeSaves({}, a)).toEqual(mergeSaves(a, a));
    const junk = { [RESULTS]: { "not-a-date": r(1), "2026-10-17": { score: "x" } }, [STATS]: "nope" };
    expect(mergeSaves(a, junk)).toEqual(mergeSaves(a, a));
    expect(mergeSaves({}, {})).toEqual({});
  });
});
