import type { ProfileSectionSwitches } from "@/lib/profileSections";
import type { PublicProfileView } from "@/lib/publicProfile";
import { SectionSwitches } from "./SectionSwitches";

/**
 * The persistent right column: the figures row, bio, external links, and — for
 * the owner — the section-visibility control strip.
 *
 * The Followers figure counts *person* follows (profile_follows) as of Phase 2.
 * The Followers / Following figures are gated by the owner's show_* switches:
 * `view.visibleSections` already reflects that, so a switched-off figure is
 * simply absent for a visitor and rendered with a "hidden" marker for the owner.
 */
export function ProfileSidebar({
  view,
  sectionSwitches = null,
}: {
  view: PublicProfileView;
  sectionSwitches?: ProfileSectionSwitches | null;
}) {
  const { collections, posts, followers, following } = view.figures;
  const sections = view.visibleSections;

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
        {sections.followers ? (
          <div className={`profile-figure${sections.followers.hidden ? " is-hidden-section" : ""}`}>
            <dt>Followers{sections.followers.hidden ? " (hidden)" : ""}</dt>
            <dd>{followers}</dd>
          </div>
        ) : null}
        {sections.following ? (
          <div className={`profile-figure${sections.following.hidden ? " is-hidden-section" : ""}`}>
            <dt>Following{sections.following.hidden ? " (hidden)" : ""}</dt>
            <dd>{following}</dd>
          </div>
        ) : null}
      </dl>

      {view.isOwner && sectionSwitches ? (
        <SectionSwitches isOwner initial={sectionSwitches} />
      ) : null}

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
    </aside>
  );
}
