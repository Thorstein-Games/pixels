/**
 * One number to rank solves by: moves × seconds, lower is better. A faster
 * solve and a more efficient one trade off evenly, so halving either halves
 * the score.
 */
export function score(moves: number, timeMs: number): number {
  return Math.round(moves * (timeMs / 1000));
}

export function formatTime(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US");
}
