"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { ComponentProps } from "react";
import {
  BIO_MAX,
  LINKS_MAX,
  LOCATION_MAX,
  validateProfileLinks,
  type ProfileLink,
} from "@/lib/profile";
import { ALLOWED_MEDIA_TYPES, type MediaKind } from "@/lib/profileUpload";

type FieldErrors = Partial<Record<"bio" | "location" | "links", string>>;

/**
 * The one Phase 1 client island: an inline `<details>` editor on the owner's
 * own profile, in the same idiom as ArchiveApp's inline editors — no modal, no
 * separate settings route. Renders correct at first paint from server props.
 *
 * Text saves go to PUT /api/account/profile; images to
 * POST /api/account/profile/media (which returns a URL we then PUT). Link
 * validation runs through the very same validateProfileLinks() the API uses.
 */
export interface ProfileEditorProps {
  handle: string;
  displayName: string;
  bio: string | null;
  location: string | null;
  links: ProfileLink[];
  avatarUrl: string | null;
  coverUrl: string | null;
  defaultOpen?: boolean;
  /** Called after a successful text save — the page revalidates here. */
  onSaved: () => void;
}

/** Connected variant used by the page: refreshes the route on save. */
export function ProfileEditorMount(props: Omit<ComponentProps<typeof ProfileEditor>, "onSaved">) {
  const router = useRouter();
  return <ProfileEditor {...props} onSaved={() => router.refresh()} />;
}

export function ProfileEditor({
  handle,
  displayName,
  bio,
  location,
  links,
  avatarUrl,
  coverUrl,
  defaultOpen = false,
  onSaved,
}: ProfileEditorProps) {
  const [bioValue, setBioValue] = useState(bio ?? "");
  const [locationValue, setLocationValue] = useState(location ?? "");
  const [linkRows, setLinkRows] = useState<ProfileLink[]>(links.length ? links : []);
  const [avatar, setAvatar] = useState<string | null>(avatarUrl);
  const [cover, setCover] = useState<string | null>(coverUrl);
  const [coverMode, setCoverMode] = useState<"generated" | "uploaded">(coverUrl ? "uploaded" : "generated");

  const [errors, setErrors] = useState<FieldErrors>({});
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const avatarInput = useRef<HTMLInputElement>(null);
  const coverInput = useRef<HTMLInputElement>(null);

  const addLink = () => {
    if (linkRows.length >= LINKS_MAX) return;
    setLinkRows((rows) => [...rows, { label: "", url: "" }]);
  };
  const removeLink = (index: number) => setLinkRows((rows) => rows.filter((_, i) => i !== index));
  const editLink = (index: number, patch: Partial<ProfileLink>) =>
    setLinkRows((rows) => rows.map((row, i) => (i === index ? { ...row, ...patch } : row)));

  async function uploadImage(kind: MediaKind, file: File): Promise<string | null> {
    const body = new FormData();
    body.set("file", file);
    body.set("kind", kind);
    setStatus("saving");
    setMessage(null);
    const response = await fetch("/api/account/profile/media", { method: "POST", body });
    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      setStatus("error");
      setMessage(payload.error ?? "That image could not be uploaded.");
      return null;
    }
    setStatus("idle");
    return typeof payload.url === "string" ? payload.url : null;
  }

  async function onSave(event: React.FormEvent) {
    event.preventDefault();

    const trimmedLinks = linkRows
      .map((row) => ({ label: row.label.trim(), url: row.url.trim() }))
      .filter((row) => row.label || row.url);
    const linkCheck = validateProfileLinks(trimmedLinks);
    if (!linkCheck.ok) {
      setErrors({ links: linkCheck.error });
      return;
    }

    setStatus("saving");
    setErrors({});
    setMessage(null);

    const response = await fetch("/api/account/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        handle,
        displayName,
        bio: bioValue,
        location: locationValue,
        links: linkCheck.value,
        avatarUrl: avatar,
        coverUrl: coverMode === "generated" ? null : cover,
      }),
    });
    const payload = await response.json().catch(() => ({}));

    if (response.status === 422) {
      setErrors((payload.fields ?? {}) as FieldErrors);
      setStatus("error");
      return;
    }
    if (!response.ok) {
      setStatus("error");
      setMessage(payload.error ?? "Saving your profile failed.");
      return;
    }

    setStatus("saved");
    setMessage("Saved.");
    onSaved();
  }

  return (
    <details className="profile-editor" open={defaultOpen}>
      <summary>Edit profile</summary>
      <form onSubmit={onSave} className="profile-editor-form">
        <label className="profile-editor-field">
          <span>Bio</span>
          <textarea
            value={bioValue}
            maxLength={BIO_MAX}
            rows={3}
            onChange={(event) => setBioValue(event.target.value)}
          />
          {errors.bio ? <em className="profile-editor-error">{errors.bio}</em> : null}
        </label>

        <label className="profile-editor-field">
          <span>Location</span>
          <input
            type="text"
            value={locationValue}
            maxLength={LOCATION_MAX}
            onChange={(event) => setLocationValue(event.target.value)}
          />
          {errors.location ? <em className="profile-editor-error">{errors.location}</em> : null}
        </label>

        <fieldset className="profile-editor-field">
          <legend>Links</legend>
          {linkRows.map((row, index) => (
            <div className="profile-editor-link-row" key={index}>
              <input
                type="text"
                aria-label={`Link ${index + 1} label`}
                placeholder="Label"
                value={row.label}
                onChange={(event) => editLink(index, { label: event.target.value })}
              />
              <input
                type="url"
                aria-label={`Link ${index + 1} URL`}
                placeholder="https://"
                value={row.url}
                onChange={(event) => editLink(index, { url: event.target.value })}
              />
              <button type="button" onClick={() => removeLink(index)} aria-label={`Remove link ${index + 1}`}>
                ×
              </button>
            </div>
          ))}
          {linkRows.length < LINKS_MAX ? (
            <button type="button" onClick={addLink} className="profile-editor-add-link">
              Add link
            </button>
          ) : (
            <p className="profile-editor-hint">Up to {LINKS_MAX} links.</p>
          )}
          {errors.links ? <em className="profile-editor-error">{errors.links}</em> : null}
        </fieldset>

        <fieldset className="profile-editor-field">
          <legend>Cover</legend>
          <label>
            <input
              type="radio"
              name="cover-mode"
              checked={coverMode === "generated"}
              onChange={() => setCoverMode("generated")}
            />
            Generated from your handle
          </label>
          <label>
            <input
              type="radio"
              name="cover-mode"
              checked={coverMode === "uploaded"}
              onChange={() => setCoverMode("uploaded")}
            />
            Uploaded photo
          </label>
          <input
            ref={coverInput}
            type="file"
            accept={ALLOWED_MEDIA_TYPES.join(",")}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const url = await uploadImage("cover", file);
              if (url) {
                setCover(url);
                setCoverMode("uploaded");
              }
            }}
          />
        </fieldset>

        <fieldset className="profile-editor-field">
          <legend>Avatar</legend>
          <input
            ref={avatarInput}
            type="file"
            accept={ALLOWED_MEDIA_TYPES.join(",")}
            onChange={async (event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              const url = await uploadImage("avatar", file);
              if (url) setAvatar(url);
            }}
          />
          {avatar ? (
            <button type="button" onClick={() => setAvatar(null)}>
              Remove avatar
            </button>
          ) : null}
        </fieldset>

        <div className="profile-editor-actions">
          <button type="submit" disabled={status === "saving"}>
            {status === "saving" ? "Saving…" : "Save profile"}
          </button>
          {message ? (
            <span
              className={status === "error" ? "profile-editor-error" : "profile-editor-ok"}
              role="status"
            >
              {message}
            </span>
          ) : null}
        </div>
      </form>
    </details>
  );
}
