import { avatarInitials, generativeCover } from "@/lib/profiles/profileMedia";
import type { PublicProfileView } from "@/lib/profiles/publicProfile";

/**
 * Cover + overlapping avatar + identity (Newsreader name, @handle, one-line bio).
 */
export function ProfileBanner({ view }: { view: PublicProfileView }) {
  return (
    <header>
      <div className="profile-cover" aria-hidden={!view.coverUrl}>
        {view.coverUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="profile-cover-media" src={view.coverUrl} alt="" aria-hidden="true" />
        ) : (
          <pre className="profile-cover-generative" aria-hidden="true">
            {generativeCover(view.handle)}
          </pre>
        )}
      </div>

      <div className="profile-identity">
        {view.avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img className="profile-avatar" src={view.avatarUrl} alt="" aria-hidden="true" />
        ) : (
          <span className="profile-avatar-fallback" aria-hidden="true">
            {avatarInitials(view.displayName)}
          </span>
        )}
        <div className="profile-identity-meta">
          <h1 className="profile-identity-name">{view.displayName}</h1>
          <p className="profile-handle">@{view.handle}</p>
          {view.bio ? <p className="profile-identity-bio">{view.bio}</p> : null}
          {view.location ? <p className="profile-location">{view.location}</p> : null}
        </div>
      </div>
    </header>
  );
}