import { describe, expect, it } from "vitest";
import { addDays, currentStreak, emptyStats, puzzleNumber, recordSolve } from "../src/daily";
import { score } from "../src/score";

describe("daily", () => {
  it("numbers puzzles from launch day and crosses month ends", () => {
    expect(puzzleNumber("2026-10-16")).toBe(1);
    expect(puzzleNumber("2026-11-01")).toBe(17);
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("extends a streak on consecutive days and resets after a gap", () => {
    let s = recordSolve(emptyStats, "2026-10-16");
    s = recordSolve(s, "2026-10-17");
    s = recordSolve(s, "2026-10-17");
    expect(s).toMatchObject({ played: 2, streak: 2, bestStreak: 2 });
    expect(currentStreak(s, "2026-10-18")).toBe(2);
    expect(currentStreak(s, "2026-10-19")).toBe(0);
    s = recordSolve(s, "2026-10-20");
    expect(s).toMatchObject({ streak: 1, bestStreak: 2 });
  });

  it("scores moves × seconds", () => {
    expect(score(20, 60_000)).toBe(1200);
    expect(score(10, 120_000)).toBe(1200);
  });
});
