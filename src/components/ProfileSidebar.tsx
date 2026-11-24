import Link from "next/link";
import type { ProfileSectionSwitches } from "@/lib/profiles/profileSections";
import type { PublicProfileView } from "@/lib/profiles/publicProfile";
import { SectionSwitches } from "./SectionSwitches";

/**
 * Persistent right column: collections count, owner-only follow counts, links,
 * and section-visibility controls.
 */
export function ProfileSidebar({
  view,
  sectionSwitches = null,
}: {
  view: PublicProfileView;
  sectionSwitches?: ProfileSectionSwitches | null;
}) {
  const { followers, following } = view.figures;

  return (
    <aside className="profile-sidebar" aria-label="Profile summary">
      <dl className="profile-figures">
        <div className="profile-figure">
          <dt>Collections</dt>
          <dd>{view.figures.collections}</dd>
        </div>
      </dl>

      {view.isOwner ? (
        <p className="profile-counts-quiet">
          <Link href={`/@${view.handle}/followers`}>{followers} followers</Link>
          <span aria-hidden="true"> · </span>
          <Link href={`/@${view.handle}/following`}>{following} following</Link>
        </p>
      ) : null}

      {view.isOwner && sectionSwitches ? (
        <SectionSwitches isOwner initial={sectionSwitches} />
      ) : null}

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