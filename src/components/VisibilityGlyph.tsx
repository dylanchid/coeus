import { VISIBILITY_GLYPHS } from "@/lib/profileVisibilityGlyph";
import type { Visibility } from "@/lib/visibility";

/**
 * A single visibility tier shown as a glyph that reads without colour, with the
 * tier name available to assistive tech (never a bare glyph as the accessible
 * name). Server component, zero JS — used for the owner's inline chip on the
 * profile Posts tab and anywhere a tier is displayed rather than chosen.
 */
export function VisibilityGlyph({ visibility, className }: { visibility: Visibility; className?: string }) {
  const { glyph, label } = VISIBILITY_GLYPHS[visibility];
  return (
    <span className={className ? `visibility-glyph ${className}` : "visibility-glyph"}>
      <span aria-hidden="true">{glyph}</span>
      <span className="sr-only">{label}</span>
    </span>
  );
}
