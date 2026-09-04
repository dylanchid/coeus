"use client";

import { useMemo, useState } from "react";
import {
  archiveArticle,
  type ArchiveData,
} from "@/lib/archive";
import type { Article } from "@/lib/types";
import { useArchive } from "./AppProviders";

type Destination = "social" | "friend" | "personal" | "public" | "community";

type Props = {
  article: Article;
  sourceName: string;
  topic: string;
  onClose: () => void;
  onDone: (message: string) => void;
};

const DESTINATIONS: { id: Destination; label: string; hint: string }[] = [
  { id: "social", label: "Discover", hint: "Share a sourced clip with your perspective" },
  { id: "friend", label: "A friend", hint: "Use your device share sheet or copy" },
  { id: "personal", label: "Personal collection", hint: "Private or unlisted, just yours" },
  { id: "public", label: "Public collection", hint: "A collection people can follow" },
  { id: "community", label: "Community collection", hint: "Contribute to a shared shelf" },
];

function ensureItem(data: ArchiveData, article: Article, sourceName: string, topic: string) {
  const next = archiveArticle(data, article, sourceName, topic);
  const item = next.items.find((candidate) => candidate.articleId === article.id || candidate.url === article.url);
  return { next, item };
}

export function ShareSheet({ article, sourceName, topic, onClose, onDone }: Props) {
  const { archive: data, updateArchive } = useArchive();
  const [destination, setDestination] = useState<Destination>("social");
  const [excerpt, setExcerpt] = useState(article.summary || article.title);
  const [commentary, setCommentary] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [busy, setBusy] = useState(false);

  const collections = useMemo(() => {
    const available = data?.collections ?? [];
    if (destination === "community") return available.filter((collection) => collection.kind === "community");
    if (destination === "public") return available.filter((collection) => collection.kind === "personal" && collection.visibility === "public");
    return available.filter((collection) => collection.kind === "personal" && collection.visibility !== "public");
  }, [data, destination]);

  const submit = async () => {
    setBusy(true);
    if (destination === "friend") {
      const text = [commentary.trim(), excerpt.trim()].filter(Boolean).join("\n\n");
      try {
        if (navigator.share) {
          await navigator.share({ title: article.title, text, url: article.url });
          onDone("Shared with your device share sheet");
        } else {
          await navigator.clipboard.writeText(`${text}\n\n${article.title}\n${article.url}`);
          onDone("Share text and link copied");
        }
        onClose();
      } catch {
        setBusy(false);
      }
      return;
    }

    if (!data) {
      setBusy(false);
      return;
    }
    const { next, item } = ensureItem(data, article, sourceName, topic);
    if (!item) return;
    let updated = next;

    if (destination === "social") {
      updated = {
        ...updated,
        socialPosts: [{
          id: `post-${Date.now()}`,
          itemId: item.id,
          excerpt: excerpt.trim(),
          commentary: commentary.trim(),
          audience: "public",
          createdAt: new Date().toISOString(),
          author: "You",
        }, ...updated.socialPosts],
      };
    } else {
      const targetId = collectionId || collections[0]?.id;
      updated = {
        ...updated,
        items: updated.items.map((candidate) => candidate.id === item.id
          ? { ...candidate, collectionIds: targetId ? [targetId] : candidate.collectionIds, note: commentary.trim() || candidate.note }
          : candidate),
      };
    }
    updateArchive(() => updated);
    onDone(destination === "social" ? "Shared to Discover" : `Saved to ${collections.find((collection) => collection.id === (collectionId || collections[0]?.id))?.name ?? "collection"}`);
    onClose();
  };

  return (
    <div className="share-sheet-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="share-sheet" role="dialog" aria-modal="true" aria-labelledby="share-sheet-title">
        <header>
          <div><p>Share, save, or collect</p><h2 id="share-sheet-title">Choose where this piece goes.</h2></div>
          <button type="button" onClick={onClose} aria-label="Close share sheet">×</button>
        </header>
        <div className="share-sheet-source"><span>{sourceName}</span><strong>{article.title}</strong></div>
        <div className="share-destinations" role="radiogroup" aria-label="Destination">
          {DESTINATIONS.map((option) => (
            <button key={option.id} role="radio" aria-checked={destination === option.id} onClick={() => { setDestination(option.id); setCollectionId(""); }}>
              <span>{option.label}</span><small>{option.hint}</small>
            </button>
          ))}
        </div>
        <div className="share-compose">
          <label><span>Clip or excerpt</span><textarea value={excerpt} onChange={(event) => setExcerpt(event.target.value)} placeholder="Paste or type the specific passage you want to carry forward." /></label>
          <label><span>{destination === "friend" ? "Message" : "Your note"}</span><textarea value={commentary} onChange={(event) => setCommentary(event.target.value)} placeholder="Why does this matter? What should people notice?" /></label>
          {destination === "personal" || destination === "public" || destination === "community" ? (
            <label><span>Collection</span><select value={collectionId || collections[0]?.id || ""} onChange={(event) => setCollectionId(event.target.value)}>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.kind === "community" ? "Community · " : ""}{collection.name}</option>)}</select></label>
          ) : null}
        </div>
        <footer>
          <p>{destination === "social" ? "Your clip keeps its original source and canonical link." : destination === "friend" ? "Nothing is posted publicly." : "You can change collection visibility later."}</p>
          <div><button type="button" onClick={onClose}>Cancel</button><button type="button" className="share-primary" disabled={busy || (destination === "social" && !excerpt.trim())} onClick={() => void submit()}>{busy ? "Working…" : destination === "friend" ? "Share ↗" : destination === "social" ? "Publish clip" : "Save here"}</button></div>
        </footer>
      </section>
    </div>
  );
}
