import { ExternalLinkHint } from "./ExternalLinkHint";
import { VisibilityGlyph } from "./VisibilityGlyph";
import type { CardTarget, ProfileInteractionCard } from "@/lib/conversationProfile";

const DATE_FORMAT = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

function when(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : DATE_FORMAT.format(date);
}

/**
 * The Likes and Reposts tab feeds. Both render a list of
 * {@link ProfileInteractionCard} — the difference is density:
 *
 *   - `reposts` renders the target as a compact card with its own metadata;
 *   - `likes` renders a lighter one-line row: what, where it lives, and when.
 *
 * Every row was already re-checked against its target's CURRENT visibility in
 * deriveProfileView() → canSeeIndirect(); this component only lays them out.
 * A card is built from the freshly-joined target, never from denormalised data
 * (the reposts table stores none — task nfq.3.1).
 */
export function ProfileInteractions({
  cards,
  kind,
  isOwner,
  handle,
}: {
  cards: ProfileInteractionCard[];
  kind: "likes" | "reposts";
  isOwner: boolean;
  /** The profile's handle — for the empty state, and to omit "@handle" on a
   * target the profile owns itself. */
  handle: string;
}) {
  if (!cards.length) {
    const noun = kind === "likes" ? "liked anything" : "reposted anything";
    return (
      <p className="profile-feed-empty">
        {isOwner ? `You haven’t ${noun} yet.` : `@${handle} hasn’t ${noun} yet.`}
      </p>
    );
  }

  return (
    <ol className={`profile-interactions is-${kind}`}>
      {cards.map((card, index) => (
        <li className="profile-interaction" key={`${targetKey(card.target)}-${index}`}>
          {kind === "reposts" ? (
            <RepostCard target={card.target} isOwner={isOwner} profileHandle={handle} />
          ) : (
            <LikeRow target={card.target} isOwner={isOwner} profileHandle={handle} />
          )}
          <p className="profile-interaction-when">
            <time dateTime={card.createdAt}>{when(card.createdAt)}</time>
          </p>
        </li>
      ))}
    </ol>
  );
}

function targetKey(target: CardTarget): string {
  return target.kind === "collection" ? `c:${target.slug}` : `p:${target.url}`;
}

function byline(ownerHandle: string, profileHandle: string) {
  if (ownerHandle === profileHandle) return null;
  return (
    <a className="profile-interaction-owner" href={`/@${ownerHandle}`}>
      @{ownerHandle}
    </a>
  );
}

function LikeRow({
  target,
  isOwner,
  profileHandle,
}: {
  target: CardTarget;
  isOwner: boolean;
  profileHandle: string;
}) {
  if (target.kind === "collection") {
    return (
      <p className="profile-interaction-line">
        <a href={`/c/${target.slug}`}>{target.name}</a>
        {byline(target.ownerHandle, profileHandle)}
        {isOwner ? <VisibilityGlyph visibility={target.visibility} /> : null}
      </p>
    );
  }
  return (
    <p className="profile-interaction-line">
      <a href={target.url} target="_blank" rel="noreferrer">
        {target.title}
        <ExternalLinkHint />
      </a>
      {target.sourceName ? <span className="profile-interaction-source">{target.sourceName}</span> : null}
      {byline(target.ownerHandle, profileHandle)}
      {isOwner ? <VisibilityGlyph visibility={target.visibility} /> : null}
    </p>
  );
}

function RepostCard({
  target,
  isOwner,
  profileHandle,
}: {
  target: CardTarget;
  isOwner: boolean;
  profileHandle: string;
}) {
  if (target.kind === "collection") {
    return (
      <article className="profile-interaction-card">
        <h3>
          <a href={`/c/${target.slug}`}>{target.name}</a>
        </h3>
        <p className="profile-interaction-meta">
          <span className="profile-interaction-kind">Collection</span>
          {byline(target.ownerHandle, profileHandle)}
          {isOwner ? <VisibilityGlyph visibility={target.visibility} /> : null}
        </p>
      </article>
    );
  }
  return (
    <article className="profile-interaction-card">
      <h3>
        <a href={target.url} target="_blank" rel="noreferrer">
          {target.title}
          <ExternalLinkHint />
        </a>
      </h3>
      <p className="profile-interaction-meta">
        {target.sourceName ? <span className="profile-interaction-source">{target.sourceName}</span> : null}
        {target.author ? <small>{target.author}</small> : null}
        {byline(target.ownerHandle, profileHandle)}
        {isOwner ? <VisibilityGlyph visibility={target.visibility} /> : null}
      </p>
    </article>
  );
}
