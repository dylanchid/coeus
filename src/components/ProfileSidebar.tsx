import type { ProfileSectionSwitches } from "@/lib/profileSections";
import type { PublicProfileView } from "@/lib/publicProfile";
import type { CardTarget } from "@/lib/conversationProfile";
import { SectionSwitches } from "./SectionSwitches";
import { VisibilityGlyph } from "./VisibilityGlyph";

const LIKES_STRIP_LIMIT = 6;

function targetLabel(target: CardTarget): string {
  return target.kind === "collection" ? target.name : target.sourceName || target.title;
}
function targetHref(target: CardTarget): string {
  return target.kind === "collection" ? `/c/${target.slug}` : target.url;
}

/**
 * The sidebar Likes strip: a count, a compact row of the most recent targets,
 * and a "View all" link to `?tab=likes` on the same page. Rendered only when
 * `view.likesSurface.render` — the count and the strip appear together or not
 * at all, so a visitor never sees a number with an empty strip (which would
 * leak how many private likes exist). For the owner it renders marked
 * "(hidden)" when the show_likes switch is off.
 */
function LikesStrip({ view }: { view: PublicProfileView }) {
  if (!view.likesSurface.render) return null;
  const { likes, likesSurface, likesVisibility, isOwner, handle } = view;
  const hidden = likesSurface.hiddenForOwner;

  return (
    <section className={`profile-likes-strip${hidden ? " is-hidden-section" : ""}`} aria-label="Likes">
      <p className="profile-likes-head">
        <span>
          Likes{hidden ? " (hidden)" : ""}
          {isOwner ? <VisibilityGlyph visibility={likesVisibility} className="profile-likes-tier" /> : null}
        </span>
        <span className="profile-likes-count">{likes.length}</span>
      </p>
      {likes.length ? (
        <>
          <ul className="profile-likes-thumbs">
            {likes.slice(0, LIKES_STRIP_LIMIT).map((card, index) => (
              <li key={`${targetHref(card.target)}-${index}`}>
                <a href={targetHref(card.target)} {...(card.target.kind === "post" ? { target: "_blank", rel: "noreferrer" } : {})}>
                  {targetLabel(card.target)}
                </a>
              </li>
            ))}
          </ul>
          <p className="profile-likes-all">
            <a href={`/@${handle}?tab=likes`}>View all</a>
          </p>
        </>
      ) : (
        <p className="profile-likes-empty">
          {isOwner ? "You haven’t liked anything yet." : `@${handle} hasn’t liked anything yet.`}
        </p>
      )}
    </section>
  );
}

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

      <LikesStrip view={view} />

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
