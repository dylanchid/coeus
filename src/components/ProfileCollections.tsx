import type { ProfileCollectionCard } from "@/lib/publicProfile";

function pieceLabel(count: number): string {
  return `${count} ${count === 1 ? "piece" : "pieces"}`;
}

function CollectionCard({ card }: { card: ProfileCollectionCard }) {
  return (
    <article className={`profile-collection${card.isUnpublished ? " is-unpublished" : ""}`}>
      <h3>
        {card.isUnpublished ? (
          card.name
        ) : (
          <a href={`/c/${card.slug}`}>{card.name}</a>
        )}
      </h3>
      {card.description ? <p>{card.description}</p> : null}
      <p className="profile-collection-meta">
        <span>{pieceLabel(card.itemCount)}</span>
        {card.visibility === "unlisted" ? <span className="profile-collection-flag">Unlisted</span> : null}
        {card.isUnpublished ? <span className="profile-collection-flag">Unpublished</span> : null}
      </p>
    </article>
  );
}

/**
 * The tab-driven feed column. `overview` shows the most recent few; the
 * `collections` tab shows all of them. Both read the same already-derived
 * card list — the boundary work happened in deriveProfileView().
 */
export function ProfileCollections({
  cards,
  heading,
  limit,
  emptyMessage,
}: {
  cards: ProfileCollectionCard[];
  heading?: string;
  limit?: number;
  emptyMessage: string;
}) {
  const shown = typeof limit === "number" ? cards.slice(0, limit) : cards;

  if (!shown.length) {
    return <p className="profile-feed-empty">{emptyMessage}</p>;
  }

  return (
    <>
      {heading ? <h2 className="profile-feed-heading">{heading}</h2> : null}
      {shown.map((card) => (
        <CollectionCard key={card.slug} card={card} />
      ))}
    </>
  );
}
