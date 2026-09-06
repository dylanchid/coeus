import { avatarInitials, generativeCover } from "@/lib/profileMedia";
import type { PublicProfileView } from "@/lib/publicProfile";

/**
 * Cover + overlapping avatar + identity (name, @handle, location). Server
 * component, zero client JS: the generative cover is an aria-hidden <pre> fed
 * by generativeCover(); uploaded images are plain <img> (user-supplied
 * Supabase Storage URLs, so no next/image remote config).
 *
 * The avatar is decorative and aria-hidden — the display name is right beside
 * it. The scrim (`.profile-cover::after`) keeps the name legible over either
 * cover mode.
 */
export function ProfileBanner({ view }: { view: PublicProfileView }) {
  return (
    <header>
      <div className="profile-cover">
        {view.coverUrl ? (
          // Plain <img>, not next/image: user-uploaded Supabase Storage content
          // we deliberately don't route through the image optimizer (cost, and
          // the bucket is already CDN-cached with a random filename per upload).
          // eslint-disable-next-line @next/next/no-img-element
          <img className="profile-cover-media" src={view.coverUrl} alt="" aria-hidden="true" />
        ) : (
          <pre className="profile-cover-generative" aria-hidden="true">
            {generativeCover(view.handle)}
          </pre>
        )}
        <h1 className="profile-cover-name">{view.displayName}</h1>
      </div>

      <div className="profile-identity">
        {view.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- see cover note above
          <img className="profile-avatar" src={view.avatarUrl} alt="" aria-hidden="true" />
        ) : (
          <span className="profile-avatar-fallback" aria-hidden="true">
            {avatarInitials(view.displayName)}
          </span>
        )}
        <div className="profile-identity-meta">
          <p className="profile-handle">@{view.handle}</p>
          {view.location ? <p className="profile-location">{view.location}</p> : null}
        </div>
      </div>
    </header>
  );
}
