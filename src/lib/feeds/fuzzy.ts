/**
 * Lightweight fuzzy matcher for the slash menu.
 * Returns a score (higher = better) or null if no match.
 */

export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const t = text.toLowerCase();
  if (!t) return null;

  if (t === q) return 10_000;
  if (t.startsWith(q)) return 8_000 - Math.min(t.length, 200);
  const idx = t.indexOf(q);
  if (idx >= 0) return 6_000 - idx * 2;

  // Token: all query words appear somewhere
  const words = q.split(/\s+/).filter(Boolean);
  if (words.length > 1 && words.every((w) => t.includes(w))) {
    return 4_500 - words.reduce((n, w) => n + t.indexOf(w), 0);
  }

  // Subsequence with consecutive-run bonus
  let ti = 0;
  let score = 0;
  let consecutive = 0;
  let first = -1;
  for (let qi = 0; qi < q.length; qi++) {
    const ch = q[qi]!;
    if (ch === " ") {
      consecutive = 0;
      continue;
    }
    let found = false;
    while (ti < t.length) {
      if (t[ti] === ch) {
        if (first < 0) first = ti;
        consecutive += 1;
        score += 12 + consecutive * 6;
        // Word-boundary bonus
        if (ti === 0 || /[\s\-_/.:]/.test(t[ti - 1]!)) score += 18;
        ti += 1;
        found = true;
        break;
      }
      consecutive = 0;
      ti += 1;
    }
    if (!found) return null;
  }

  score += Math.max(0, 400 - first * 3);
  score -= Math.max(0, t.length - q.length) * 0.35;
  return score;
}

/** Best score across primary + extra keyword blobs. */
export function fuzzyScoreMulti(
  query: string,
  ...parts: Array<string | undefined | null>
): number | null {
  let best: number | null = null;
  for (const p of parts) {
    if (!p) continue;
    const s = fuzzyScore(query, p);
    if (s === null) continue;
    if (best === null || s > best) best = s;
  }
  return best;
}
