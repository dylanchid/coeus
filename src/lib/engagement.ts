import type { Engagement } from "./types";

/** Compact label for UI: "107 pts · 61 comments" */
export function formatEngagement(e: Engagement | undefined | null): string {
  if (!e) return "";
  const parts: string[] = [];
  if (typeof e.points === "number") parts.push(`${e.points} pts`);
  if (typeof e.comments === "number") {
    parts.push(
      e.comments === 1 ? "1 comment" : `${e.comments} comments`
    );
  }
  return parts.join(" · ");
}
