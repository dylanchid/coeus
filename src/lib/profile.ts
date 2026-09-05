/**
 * Pure validation for the public profile a signed-in account fills in during
 * onboarding. The database enforces the same handle shape (see
 * 20260905132000_profiles.sql); this keeps the errors friendly and lets the
 * /welcome form reject bad input before it hits the API.
 */

export interface Profile {
  id: string;
  handle: string;
  displayName: string;
  bio: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ProfileInput {
  handle: string;
  displayName: string;
  bio: string | null;
}

export type ProfileField = keyof ProfileInput;

export const HANDLE_PATTERN = /^[a-z0-9_]{3,20}$/;
export const DISPLAY_NAME_MAX = 60;
export const BIO_MAX = 280;

export type ProfileValidation =
  | { ok: true; value: ProfileInput }
  | { ok: false; errors: Partial<Record<ProfileField, string>> };

/** Lowercases and trims a candidate handle so "  Ada_L " and "ada_l" collide the way the unique index does. */
export function normalizeHandle(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateProfileInput(raw: {
  handle?: unknown;
  displayName?: unknown;
  bio?: unknown;
}): ProfileValidation {
  const errors: Partial<Record<ProfileField, string>> = {};

  const handle = typeof raw.handle === "string" ? normalizeHandle(raw.handle) : "";
  if (!handle) {
    errors.handle = "Pick a handle.";
  } else if (!HANDLE_PATTERN.test(handle)) {
    errors.handle = "3–20 characters: lowercase letters, numbers, and underscores only.";
  }

  const displayName = typeof raw.displayName === "string" ? raw.displayName.trim() : "";
  if (!displayName) {
    errors.displayName = "Add a display name.";
  } else if (displayName.length > DISPLAY_NAME_MAX) {
    errors.displayName = `Keep it under ${DISPLAY_NAME_MAX} characters.`;
  }

  const bioRaw = typeof raw.bio === "string" ? raw.bio.trim() : "";
  const bio = bioRaw.length ? bioRaw : null;
  if (bio && bio.length > BIO_MAX) {
    errors.bio = `Keep it under ${BIO_MAX} characters.`;
  }

  if (Object.keys(errors).length) return { ok: false, errors };
  return { ok: true, value: { handle, displayName, bio } };
}
