/**
 * Generates the logo SVGs from code so a rename is one constant:
 *
 *   node scripts/logo.mjs
 *
 * - public/favicon.svg   the mark: blocks penning in a glowing cluster of
 *                        pixels, with one pixel streaking out of the gap
 * - public/wordmark.svg  NAME in a blocky pixel font, used in the header
 * - public/logo.svg      mark + wordmark side by side
 *
 * PNG icons and the share image are rendered from these by
 * scripts/render-images.mjs.
 */
import { writeFileSync } from "node:fs";

export const NAME = "PIX PEN";

const BG = "#0d0f16";
const BLOCK = "#f5b83d";
const BLOCK_TOP = "#ffd77a";
const BLOCK_SIDE = "#c98a1c";
const PIXEL = "#8ff3ff";

// The mark lives on a 16×16 grid: a ring of blocks with one gap.
const MARK_GRID = 16;

function block(x, y, s, fill = BLOCK, top = BLOCK_TOP, side = BLOCK_SIDE) {
  // Like the in-game blocks: lighter top edge, darker bottom.
  const e = s * 0.16;
  return [
    `<rect x="${x}" y="${y}" width="${s}" height="${s}" rx="${s * 0.08}" fill="${fill}"/>`,
    `<rect x="${x}" y="${y}" width="${s}" height="${e}" fill="${top}"/>`,
    `<rect x="${x}" y="${y + s - e}" width="${s}" height="${e}" fill="${side}"/>`,
  ].join("");
}

function mark({ background = true } = {}) {
  const g = MARK_GRID;
  const parts = [];
  if (background) {
    parts.push(
      `<defs><radialGradient id="bg" cx="50%" cy="42%" r="75%"><stop offset="0" stop-color="#232b47"/><stop offset="1" stop-color="${BG}"/></radialGradient>`,
      `<filter id="glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="0.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter></defs>`,
      `<rect width="${g}" height="${g}" rx="3.4" fill="url(#bg)"/>`,
    );
  }
  // 4×4 ring of blocks, 3 units each, filling most of the tile. The top
  // right block is missing: that's the doorway one pixel is escaping through.
  const o = 1.9;
  const s = 2.8;
  const step = 3.1;
  for (let i = 0; i < 4; i++) {
    for (let j = 0; j < 4; j++) {
      const edge = i === 0 || j === 0 || i === 3 || j === 3;
      const doorway = i === 2 && j === 0;
      if (edge && !doorway) parts.push(block(o + i * step, o + j * step, s));
    }
  }

  const glow = background ? ' filter="url(#glow)"' : "";
  const d = 0.95;
  // Trapped cluster in the 2×2 space inside the ring.
  const dots = [
    [5.6, 5.5], [7.5, 5.0], [9.3, 6.1], [6.3, 7.4], [8.4, 7.6], [5.5, 9.3], [7.3, 9.4], [9.4, 8.9], [8.1, 10.2],
  ];
  parts.push(`<g fill="${PIXEL}"${glow}>`);
  for (const [x, y] of dots) parts.push(`<rect x="${x}" y="${y}" width="${d}" height="${d}"/>`);
  // Escapee: bright head above the doorway, trail fading back inside.
  const trail = [
    [10.3, 0.55, 1.2, 1],
    [9.4, 1.75, 0.95, 0.6],
    [8.6, 2.9, 0.75, 0.35],
    [7.9, 4.0, 0.6, 0.2],
  ];
  for (const [x, y, size, a] of trail) {
    parts.push(`<rect x="${x}" y="${y}" width="${size}" height="${size}" opacity="${a}"/>`);
  }
  parts.push("</g>");
  return parts.join("");
}

// 5×7 pixel font, enough for any rename.
const FONT = {
  A: [" ### ", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
  B: ["#### ", "#   #", "#   #", "#### ", "#   #", "#   #", "#### "],
  C: [" ####", "#    ", "#    ", "#    ", "#    ", "#    ", " ####"],
  D: ["#### ", "#   #", "#   #", "#   #", "#   #", "#   #", "#### "],
  E: ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#####"],
  F: ["#####", "#    ", "#    ", "#### ", "#    ", "#    ", "#    "],
  G: [" ####", "#    ", "#    ", "#  ##", "#   #", "#   #", " ####"],
  H: ["#   #", "#   #", "#   #", "#####", "#   #", "#   #", "#   #"],
  I: ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "#####"],
  J: ["  ###", "    #", "    #", "    #", "#   #", "#   #", " ### "],
  K: ["#   #", "#  # ", "# #  ", "##   ", "# #  ", "#  # ", "#   #"],
  L: ["#    ", "#    ", "#    ", "#    ", "#    ", "#    ", "#####"],
  M: ["#   #", "## ##", "# # #", "#   #", "#   #", "#   #", "#   #"],
  N: ["#   #", "##  #", "# # #", "#  ##", "#   #", "#   #", "#   #"],
  O: [" ### ", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
  P: ["#### ", "#   #", "#   #", "#### ", "#    ", "#    ", "#    "],
  Q: [" ### ", "#   #", "#   #", "#   #", "# # #", "#  # ", " ## #"],
  R: ["#### ", "#   #", "#   #", "#### ", "# #  ", "#  # ", "#   #"],
  S: [" ####", "#    ", "#    ", " ### ", "    #", "    #", "#### "],
  T: ["#####", "  #  ", "  #  ", "  #  ", "  #  ", "  #  ", "  #  "],
  U: ["#   #", "#   #", "#   #", "#   #", "#   #", "#   #", " ### "],
  V: ["#   #", "#   #", "#   #", "#   #", "#   #", " # # ", "  #  "],
  W: ["#   #", "#   #", "#   #", "#   #", "# # #", "## ##", "#   #"],
  X: ["#   #", "#   #", " # # ", "  #  ", " # # ", "#   #", "#   #"],
  Y: ["#   #", "#   #", " # # ", "  #  ", "  #  ", "  #  ", "  #  "],
  Z: ["#####", "    #", "   # ", "  #  ", " #   ", "#    ", "#####"],
  "'": ["#", "#", " ", " ", " ", " ", " "],
  " ": ["   ", "   ", "   ", "   ", "   ", "   ", "   "],
};

/**
 * NAME as pixel blocks: solid cyan cells over an amber drop shadow, like
 * pixels sitting on blocks. Returns SVG bodies and the size in font units.
 */
function wordmark(text = NAME) {
  const cells = [];
  let x = 0;
  for (const ch of text.toUpperCase()) {
    const glyph = FONT[ch];
    if (!glyph) throw new Error(`No glyph for ${JSON.stringify(ch)}`);
    glyph.forEach((row, y) => {
      [...row].forEach((on, i) => {
        if (on === "#") cells.push([x + i, y]);
      });
    });
    x += glyph[0].length + 1;
  }
  // One path per layer, so neighbouring cells don't leave antialiasing seams.
  const rect = (dx, dy) => `<path d="${cells.map(([cx, cy]) => `M${cx + dx} ${cy + dy}h1v1h-1z`).join("")}"/>`;
  return {
    shadow: `<g fill="${BLOCK_SIDE}">${rect(0.42, 0.42)}</g><g fill="${BLOCK}">${rect(0.24, 0.24)}</g>`,
    face: rect(0, 0),
    width: x - 1 + 0.42,
    height: 7 + 0.42,
  };
}

const glowFilter = (id, sd) =>
  `<filter id="${id}" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="${sd}" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;

function wordmarkSvg() {
  const w = wordmark();
  const pad = 1;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-pad} ${-pad} ${w.width + 2 * pad} ${w.height + 2 * pad}" role="img" aria-label="${NAME}">
<defs>${glowFilter("g", 0.35)}<linearGradient id="fill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4fbff"/><stop offset="1" stop-color="${PIXEL}"/></linearGradient></defs>
${w.shadow}<g fill="url(#fill)" filter="url(#g)">${w.face}</g>
</svg>
`;
}

function markSvg() {
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${MARK_GRID} ${MARK_GRID}" role="img" aria-label="${NAME}">
${mark()}
</svg>
`;
}

function logoSvg() {
  const w = wordmark();
  const scale = 1.4; // wordmark units per mark unit
  const gap = 2.5;
  const width = MARK_GRID + gap + w.width * scale + 1;
  const ty = (MARK_GRID - w.height * scale) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${MARK_GRID}" role="img" aria-label="${NAME}">
${mark()}
<defs>${glowFilter("wg", 0.35)}<linearGradient id="wfill" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d4fbff"/><stop offset="1" stop-color="${PIXEL}"/></linearGradient></defs>
<g transform="translate(${MARK_GRID + gap} ${ty}) scale(${scale})">${w.shadow}<g fill="url(#wfill)" filter="url(#wg)">${w.face}</g></g>
</svg>
`;
}

const out = new URL("../public/", import.meta.url);
writeFileSync(new URL("favicon.svg", out), markSvg());
writeFileSync(new URL("wordmark.svg", out), wordmarkSvg());
writeFileSync(new URL("logo.svg", out), logoSvg());
console.log("wrote favicon.svg, wordmark.svg, logo.svg");
