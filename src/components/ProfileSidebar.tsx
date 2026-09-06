import type { PublicProfileView } from "@/lib/publicProfile";

/**
 * The persistent right column: the figures row, bio, and external links.
 * Server component, zero client JS. The Likes strip is Phase 3 and is omitted,
 * not stubbed.
 *
 * The Followers figure counts *collection* followers this phase (an aggregate
 * over collection_follows) and is labelled as such — Phase 2 replaces it with
 * person-follows.
 */
export function ProfileSidebar({ view }: { view: PublicProfileView }) {
  const { collections, posts, followers, following } = view.figures;

  return (
    <aside className="profile-sidebar" aria-label="Profile summary">
      <dl className="profile-figures">
        <div className="profile-figure">
          <dt>Collections</dt>
          <dd>{collections}</dd>
        </div>
        <div className="profile-figure">
          <dt>Posts</dt>
          <dd>{posts}</dd>
        </div>
        <div className="profile-figure">
          <dt>Coll. followers</dt>
          <dd>{followers}</dd>
        </div>
        <div className="profile-figure">
          <dt>Following</dt>
          <dd>{following}</dd>
        </div>
      </dl>

      {view.bio ? <p className="profile-sidebar-bio">{view.bio}</p> : null}

      {view.links.length ? (
        <ul className="profile-sidebar-links">
          {view.links.map((link) => (
            <li key={link.url}>
              <a href={link.url} target="_blank" rel="noreferrer nofollow">
                {link.label}
              </a>
            </li>
          ))}
        </ul>
      ) : null}

      <p className="profile-sidebar-note">Followers counts subscriptions to this curator&rsquo;s collections.</p>
    </aside>
  );
}
