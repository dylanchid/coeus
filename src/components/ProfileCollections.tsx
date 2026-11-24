import Link from "next/link";
import type { ReactNode } from "react";
import type { ProfileCollectionCard } from "@/lib/profiles/publicProfile";

const DATE_FORMAT = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

function formatUpdated(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? "" : DATE_FORMAT.format(date);
}

function ShelfRow({ card }: { card: ProfileCollectionCard }) {
  const unlisted = card.visibility === "unlisted";
  return (
    <article
      className={[
        "profile-shelf-row",
        unlisted ? "is-unlisted" : "",
        card.isUnpublished ? "is-unpublished" : "",
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="profile-shelf-col profile-shelf-col--collection">
        {card.isUnpublished ? (
          <span>{card.name}</span>
        ) : (
          <Link href={`/c/${card.slug}`}>{card.name}</Link>
        )}
        {unlisted ? <span className="profile-collection-flag">Unlisted</span> : null}
        {card.isUnpublished ? <span className="profile-collection-flag">Unpublished</span> : null}
      </div>
      <div className="profile-shelf-col profile-shelf-col--items">{card.itemCount}</div>
      <div className="profile-shelf-col profile-shelf-col--updated">{formatUpdated(card.updatedAt)}</div>
    </article>
  );
}

/**
 * Editorial shelf: a tabular index of published collections for this profile.
 */
export function ProfileCollections({
  cards,
  emptyMessage,
  emptyAction = null,
}: {
  cards: ProfileCollectionCard[];
  emptyMessage: string;
  emptyAction?: ReactNode;
}) {
  if (!cards.length) {
    if (emptyAction) return <>{emptyAction}</>;
    return <p className="profile-feed-empty">{emptyMessage}</p>;
  }

  return (
    <section className="profile-shelf" aria-label="Published collections">
      <div className="profile-shelf-header">
        <div className="profile-shelf-col profile-shelf-col--collection">[COLLECTION]</div>
        <div className="profile-shelf-col profile-shelf-col--items">[ITEMS]</div>
        <div className="profile-shelf-col profile-shelf-col--updated">[UPDATED]</div>
      </div>
      {cards.map((card) => (
        <ShelfRow key={card.slug} card={card} />
      ))}
    </section>
  );
}