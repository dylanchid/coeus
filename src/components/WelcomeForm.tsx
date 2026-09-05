"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { BIO_MAX, DISPLAY_NAME_MAX, validateProfileInput, type Profile, type ProfileField } from "@/lib/profile";
import { useAuth } from "./AuthProvider";

type FieldErrors = Partial<Record<ProfileField, string>>;

function safeNext(raw: string | undefined): string {
  return raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/archive";
}

/**
 * Onboarding + profile editing on one route. A signed-in account with no
 * profile row cannot get past here (ProfileGate keeps sending it back); an
 * account that already has a profile sees the same form prefilled. Signed-out
 * visitors are bounced to /signin.
 */
export function WelcomeForm({ next: rawNext }: { next?: string }) {
  const next = safeNext(rawNext);
  const router = useRouter();
  const { status, profile, applyProfile } = useAuth();

  const [errors, setErrors] = useState<FieldErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (status === "signed-out") router.replace(`/signin?next=${encodeURIComponent("/welcome")}`);
  }, [status, router]);

  const submit = async (values: { handle: string; displayName: string; bio: string }) => {
    setFormError(null);
    const validated = validateProfileInput(values);
    if (!validated.ok) {
      setErrors(validated.errors);
      return;
    }
    setErrors({});
    setSubmitting(true);
    try {
      const response = await fetch("/api/account/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(validated.value),
      });
      const body = (await response.json().catch(() => null)) as
        | { profile?: Profile; error?: string; field?: string; fields?: FieldErrors }
        | null;

      if (response.ok && body?.profile) {
        applyProfile(body.profile);
        router.replace(next);
        return;
      }
      if (response.status === 409 && body?.field === "handle") {
        setErrors({ handle: body.error ?? "That handle is already taken." });
        return;
      }
      if (response.status === 422 && body?.fields) {
        setErrors(body.fields);
        return;
      }
      setFormError(body?.error ?? "Saving your profile failed. Try again.");
    } catch {
      setFormError("Saving your profile failed. Check your connection and try again.");
    } finally {
      setSubmitting(false);
    }
  };

  if (status === "loading") {
    return (
      <p className="welcome-loading" role="status">
        Loading…
      </p>
    );
  }
  if (status === "signed-out") {
    return null; // redirecting to /signin
  }

  return (
    <ProfileFields
      // Remount (picking up prefilled values) once an existing profile loads.
      key={profile?.id ?? "new"}
      editing={Boolean(profile)}
      initial={{
        handle: profile?.handle ?? "",
        displayName: profile?.displayName ?? "",
        bio: profile?.bio ?? "",
      }}
      errors={errors}
      formError={formError}
      submitting={submitting}
      onSubmit={submit}
    />
  );
}

function ProfileFields({
  editing,
  initial,
  errors,
  formError,
  submitting,
  onSubmit,
}: {
  editing: boolean;
  initial: { handle: string; displayName: string; bio: string };
  errors: FieldErrors;
  formError: string | null;
  submitting: boolean;
  onSubmit(values: { handle: string; displayName: string; bio: string }): void;
}) {
  const [handle, setHandle] = useState(initial.handle);
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [bio, setBio] = useState(initial.bio);
  const bioCount = useMemo(() => `${bio.trim().length}/${BIO_MAX}`, [bio]);

  return (
    <section className="welcome-form" aria-labelledby="welcome-heading">
      <h1 id="welcome-heading">{editing ? "Edit your profile" : "Choose your handle"}</h1>
      <p className="welcome-lede">
        {editing
          ? "Your handle and name appear on collections you publish."
          : "This is how you’ll appear on collections you publish. You can change it later."}
      </p>

      {formError ? (
        <p className="welcome-error" role="alert">
          {formError}
        </p>
      ) : null}

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit({ handle, displayName, bio });
        }}
      >
        <div className="welcome-field">
          <label htmlFor="welcome-handle">Handle</label>
          <input
            id="welcome-handle"
            name="handle"
            value={handle}
            autoComplete="off"
            autoCapitalize="none"
            spellCheck={false}
            maxLength={20}
            aria-invalid={Boolean(errors.handle)}
            aria-describedby={errors.handle ? "welcome-handle-error" : "welcome-handle-hint"}
            onChange={(event) => setHandle(event.target.value)}
          />
          {errors.handle ? (
            <p className="welcome-field-error" id="welcome-handle-error">
              {errors.handle}
            </p>
          ) : (
            <p className="welcome-field-hint" id="welcome-handle-hint">
              3–20 characters: lowercase letters, numbers, underscores.
            </p>
          )}
        </div>

        <div className="welcome-field">
          <label htmlFor="welcome-name">Display name</label>
          <input
            id="welcome-name"
            name="displayName"
            value={displayName}
            maxLength={DISPLAY_NAME_MAX}
            aria-invalid={Boolean(errors.displayName)}
            aria-describedby={errors.displayName ? "welcome-name-error" : undefined}
            onChange={(event) => setDisplayName(event.target.value)}
          />
          {errors.displayName ? (
            <p className="welcome-field-error" id="welcome-name-error">
              {errors.displayName}
            </p>
          ) : null}
        </div>

        <div className="welcome-field">
          <label htmlFor="welcome-bio">
            Bio <span className="welcome-optional">(optional)</span>
          </label>
          <textarea
            id="welcome-bio"
            name="bio"
            value={bio}
            rows={3}
            aria-invalid={Boolean(errors.bio)}
            aria-describedby={errors.bio ? "welcome-bio-error" : "welcome-bio-count"}
            onChange={(event) => setBio(event.target.value)}
          />
          {errors.bio ? (
            <p className="welcome-field-error" id="welcome-bio-error">
              {errors.bio}
            </p>
          ) : (
            <p className="welcome-field-hint" id="welcome-bio-count">
              {bioCount}
            </p>
          )}
        </div>

        <button type="submit" disabled={submitting}>
          {submitting ? "Saving…" : editing ? "Save profile" : "Continue"}
        </button>
      </form>
    </section>
  );
}
