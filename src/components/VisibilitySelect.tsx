"use client";

import { visibilityChoices } from "@/lib/profileVisibilityGlyph";
import type { Visibility } from "@/lib/visibility";

/**
 * The shared four-value visibility control. One component for every place a
 * person picks a tier — both ArchiveApp selects today, the Phase 3 controls
 * next — so the list is edited once. The option text carries the glyph, but
 * the accessible name is the plain label (`aria-label` on each `<option>`), so
 * a screen reader announces "Followers only", not "◐".
 *
 * `allow` narrows the offered set where a surface should not expose every tier.
 */
export function VisibilitySelect({
  id,
  name,
  value,
  onChange,
  allow,
  className,
  disabled = false,
}: {
  id?: string;
  name?: string;
  value: Visibility;
  onChange: (value: Visibility) => void;
  allow?: readonly Visibility[];
  className?: string;
  /** Rendered read-only where the tier is fixed — e.g. a reply that inherits
   * its target's visibility on the server (Phase 3). */
  disabled?: boolean;
}) {
  const choices = visibilityChoices().filter((choice) => !allow || allow.includes(choice.value));
  return (
    <select
      id={id}
      name={name}
      className={className}
      value={value}
      disabled={disabled}
      onChange={(event) => onChange(event.target.value as Visibility)}
    >
      {choices.map((choice) => (
        <option key={choice.value} value={choice.value} aria-label={choice.label}>
          {choice.glyph}  {choice.label}
        </option>
      ))}
    </select>
  );
}
