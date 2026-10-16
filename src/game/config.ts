/**
 * Tuning knobs. Everything about how hard a board is lives here, so
 * playtesting changes stay in one file.
 */
export const COLS = 14;
export const ROWS = 20;

export const PIXEL_COUNT = 100;
/** Number of clusters the pixels start in. */
export const SPAWN_POINTS = 2;
/** Cells per second. */
export const PIXEL_SPEED = 1.5;
/** Collision margin in cells, so a pixel's dot never overlaps a wall. */
export const PIXEL_RADIUS = 0.07;

/** Win when every pixel can reach at most this share of the open cells. */
export const WIN_AREA_RATIO = 0.1;

/** Rooms this size (in cells) or smaller aren't divided further. */
export const ROOM_MAX_CELLS = 40;
/** Share of interior wall cells knocked out after generation for extra gaps. */
export const WALL_GAP_RATIO = 0.08;

/** Fixed simulation step, so a seed plays out identically on every device. */
export const STEP_SECONDS = 1 / 120;
