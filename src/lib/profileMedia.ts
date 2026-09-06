/**
 * Deterministic fallback media for a profile with nothing uploaded.
 *
 * A profile with no cover still has to look deliberate, so we generate one
 * from the handle: a monospace character field seeded by the handle, so the
 * same handle always yields the same cover — this render and every future
 * one. That determinism is also what makes this trivially testable: the test
 * is a fixture comparison, not a visual check.
 *
 * Pure: no DOM, no crypto, no randomness beyond the seeded PRNG. Rendered
 * server-side into the banner as an aria-hidden <pre>, so it costs no client
 * JavaScript.
 */

/** Ramp of increasing visual density. Index 0 is a space (empty). */
export const COVER_RAMP = " .-:+=*%#";
export const COVER_COLS = 170;
export const COVER_ROWS = 22;

/** FNV-1a over the handle's char codes. Returns an unsigned 32-bit integer. */
export function coverSeed(handle: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < handle.length; index += 1) {
    hash ^= handle.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/** mulberry32 — a small, fast, fully deterministic PRNG seeded by one uint32. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Fill a `cols`×`rows` grid from {@link COVER_RAMP}. Density rises toward the
 * bottom-right (a diagonal gradient) with seeded per-cell noise on top, so the
 * field reads as a soft woodcut rather than static. Returns the rows joined by
 * "\n"; the row count is exactly `rows` and every row is exactly `cols` long.
 */
export function generativeCover(handle: string, cols: number = COVER_COLS, rows: number = COVER_ROWS): string {
  const random = mulberry32(coverSeed(handle));
  const colSpan = Math.max(1, cols - 1);
  const rowSpan = Math.max(1, rows - 1);
  const lines: string[] = [];
  for (let y = 0; y < rows; y += 1) {
    let line = "";
    for (let x = 0; x < cols; x += 1) {
      const gradient = (x / colSpan + y / rowSpan) / 2;
      const density = Math.min(0.9999, Math.max(0, gradient * 0.7 + random() * 0.5 - 0.1));
      line += COVER_RAMP[Math.min(COVER_RAMP.length - 1, Math.floor(density * COVER_RAMP.length))];
    }
    lines.push(line);
  }
  return lines.join("\n");
}

/**
 * One or two uppercase letters for the square avatar fallback. One word → its
 * first letter; two or more → first letters of the first and last words.
 * Tolerates extra whitespace and non-Latin input, and never returns more than
 * two characters or throws.
 */
export function avatarInitials(displayName: string): string {
  const words = displayName.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = [...words[0]][0] ?? "";
  if (words.length === 1) return first.toUpperCase().slice(0, 2);
  const last = [...words[words.length - 1]][0] ?? "";
  return (first + last).toUpperCase().slice(0, 2);
}
