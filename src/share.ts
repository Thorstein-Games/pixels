import { formatNumber, formatTime } from "./score";
import type { DailyResult } from "./daily";

export const GAME_NAME = "Pixels";
export const SITE_URL = "https://thorsteingames.com/pixels";

export function shareText(number: number, result: DailyResult, streak: number): string {
  const lines = [
    `${GAME_NAME} #${number}`,
    `⏱ ${formatTime(result.timeMs)} · 🧱 ${result.moves} moves`,
    `Score ${formatNumber(result.score)} (lower wins)${streak > 1 ? ` · 🔥 ${streak}` : ""}`,
    SITE_URL,
  ];
  return lines.join("\n");
}
