import type { PublicationVisibility } from "./collectionPublication.ts";

/** The three publish tiers offered in Archive. `public` is labeled Published in the UI. */
export const LADDER = ["private", "unlisted", "public"] as const;

export type LadderStep = (typeof LADDER)[number];

export const LADDER_LABELS: Record<LadderStep, string> = {
  private: "Private",
  unlisted: "Unlisted",
  public: "Published",
};

export const LADDER_HELPERS: Record<LadderStep, string> = {
  private: "Only you",
  unlisted: "Anyone with the link; not listed or in feeds",
  public: "Listed in Discover, on @handle and in /@handle/rss.xml",
};

export function isLadderStep(value: PublicationVisibility): value is LadderStep {
  return (LADDER as readonly string[]).includes(value);
}

/** Human label for status lines and metadata; maps legacy `followers`. */
export function ladderLabel(visibility: PublicationVisibility): string {
  if (visibility === "followers") return "Followers only (legacy)";
  if (isLadderStep(visibility)) return LADDER_LABELS[visibility];
  return visibility;
}

const EYEBROW_KICKERS: Record<PublicationVisibility, string> = {
  public: "[PUBLISHED COLLECTION]",
  unlisted: "[UNLISTED COLLECTION]",
  private: "[PRIVATE COLLECTION]",
  followers: "[FOLLOWERS-ONLY COLLECTION]",
};

export function collectionEyebrowKicker(visibility: PublicationVisibility): string {
  return EYEBROW_KICKERS[visibility];
}