import { VISIBILITIES, type Visibility } from "./visibility.ts";

/**
 * The colour-free glyph encoding for the four visibility tiers, shared by every
 * surface that shows a tier to a person: the two ArchiveApp selects, the
 * owner's inline chip on the profile Posts tab, and the Phase 3 tabs.
 *
 * The glyphs read without colour — a filling ramp from solid to open:
 *   ● private   — filled, closed to everyone but you
 *   ◐ followers — half filled
 *   ◍ unlisted  — dotted, reachable only by link
 *   ○ public    — open
 *
 * Every tier carries a real-word `label`; a glyph on its own is never the
 * accessible name.
 *
 * Pure by contract: imports only visibility.ts, so it is testable under
 * `node --test` with no database and no DOM.
 */

export interface VisibilityGlyph {
  glyph: string;
  label: string;
}

export const VISIBILITY_GLYPHS: Record<Visibility, VisibilityGlyph> = {
  private: { glyph: "●", label: "Private" },
  followers: { glyph: "◐", label: "Followers only" },
  unlisted: { glyph: "◍", label: "Unlisted — link only" },
  public: { glyph: "○", label: "Public — discoverable" },
};

export interface VisibilityChoice extends VisibilityGlyph {
  value: Visibility;
}

/** The four tiers in enum order (least to most visible), for a `<select>`. */
export function visibilityChoices(): VisibilityChoice[] {
  return VISIBILITIES.map((value) => ({ value, ...VISIBILITY_GLYPHS[value] }));
}
