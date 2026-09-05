"use client";

import Link from "next/link";
import { useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  archiveArticle,
  type ArchiveData,
} from "@/lib/archive";
import type { Article } from "@/lib/types";
import {
  collectionsForDestination,
  isCollectionDestination,
  isShareCancellation,
  resolveCollectionId,
  type ShareDestination,
} from "@/lib/shareDestination";
import { useModalDialog } from "@/hooks/useModalDialog";
import { useArchive } from "./AppProviders";

type Props = {
  article: Article;
  sourceName: string;
  topic: string;
  onClose: () => void;
  onDone: (message: string) => void;
};

const DESTINATIONS: { id: ShareDestination; label: string; hint: string }[] = [
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
  const [destination, setDestination] = useState<ShareDestination>("social");
  const [excerpt, setExcerpt] = useState(article.summary || article.title);
  const [commentary, setCommentary] = useState("");
  const [collectionId, setCollectionId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useModalDialog({ active: true, containerRef: dialogRef, initialFocusRef: closeRef, onClose });

  const collections = useMemo(() => {
    return collectionsForDestination(data?.collections ?? [], destination);
  }, [data, destination]);

  const needsCollection = isCollectionDestination(destination);
  const selectedCollectionId = resolveCollectionId(collections, collectionId);

  const chooseDestination = (next: ShareDestination) => {
    setDestination(next);
    setCollectionId("");
    setError("");
  };

  const moveDestination = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const direction = event.key === "ArrowRight" || event.key === "ArrowDown"
      ? 1
      : event.key === "ArrowLeft" || event.key === "ArrowUp"
        ? -1
        : 0;
    if (!direction && event.key !== "Home" && event.key !== "End") return;
    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? DESTINATIONS.length - 1
        : (index + direction + DESTINATIONS.length) % DESTINATIONS.length;
    chooseDestination(DESTINATIONS[nextIndex]!.id);
    const buttons = event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>("[role='radio']");
    buttons?.[nextIndex]?.focus();
  };

  const submit = async () => {
    setBusy(true);
    setError("");
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
      } catch (shareError) {
        if (!isShareCancellation(shareError)) {
          setError("Sharing failed. Check clipboard permissions and try again.");
        }
        setBusy(false);
      }
      return;
    }

    if (!data) {
      setError("Your archive is still loading. Try again in a moment.");
      setBusy(false);
      return;
    }
    if (needsCollection && !selectedCollectionId) {
      setError("Create a matching collection before saving here.");
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
      const targetId = selectedCollectionId;
      updated = {
        ...updated,
        items: updated.items.map((candidate) => candidate.id === item.id
          ? { ...candidate, collectionIds: targetId ? [targetId] : candidate.collectionIds, note: commentary.trim() || candidate.note }
          : candidate),
      };
    }
    const saved = await updateArchive(() => updated);
    if (!saved) {
      setError("This change could not be saved. Retry before closing the sheet.");
      setBusy(false);
      return;
    }
    onDone(destination === "social" ? "Shared to Discover" : `Saved to ${collections.find((collection) => collection.id === selectedCollectionId)!.name}`);
    onClose();
  };

  return (
    <div className="share-sheet-overlay" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section ref={dialogRef} className="share-sheet" role="dialog" aria-modal="true" aria-labelledby="share-sheet-title" aria-describedby={error ? "share-sheet-error" : undefined} tabIndex={-1}>
        <header>
          <div><p>Share, save, or collect</p><h2 id="share-sheet-title">Choose where this piece goes.</h2></div>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="Close share sheet">×</button>
        </header>
        <div className="share-sheet-source"><span>{sourceName}</span><strong>{article.title}</strong></div>
        <div className="share-destinations" role="radiogroup" aria-label="Destination">
          {DESTINATIONS.map((option, index) => (
            <button key={option.id} type="button" role="radio" aria-checked={destination === option.id} tabIndex={destination === option.id ? 0 : -1} onKeyDown={(event) => moveDestination(event, index)} onClick={() => chooseDestination(option.id)}>
              <span>{option.label}</span><small>{option.hint}</small>
            </button>
          ))}
        </div>
        <div className="share-compose">
          <label><span>Clip or excerpt</span><textarea value={excerpt} onChange={(event) => setExcerpt(event.target.value)} placeholder="Paste or type the specific passage you want to carry forward." /></label>
          <label><span>{destination === "friend" ? "Message" : "Your note"}</span><textarea value={commentary} onChange={(event) => setCommentary(event.target.value)} placeholder="Why does this matter? What should people notice?" /></label>
          {needsCollection && collections.length ? (
            <label><span>Collection</span><select value={selectedCollectionId ?? ""} onChange={(event) => setCollectionId(event.target.value)}>{collections.map((collection) => <option key={collection.id} value={collection.id}>{collection.kind === "community" ? "Community · " : ""}{collection.name}</option>)}</select></label>
          ) : needsCollection ? (
            <p className="share-empty-collection">No matching collection exists. <Link href="/archive">Create one in Archive</Link>, then return here.</p>
          ) : null}
          {error ? <p id="share-sheet-error" className="share-error" role="alert">{error}</p> : null}
        </div>
        <footer>
          <p>{destination === "social" ? "Your clip keeps its original source and canonical link." : destination === "friend" ? "Nothing is posted publicly." : destination === "public" || destination === "community" ? "Publish this collection from the Archive sidebar to put it at a stable public link." : "You can change collection visibility later."}</p>
          <div><button type="button" onClick={onClose}>Cancel</button><button type="button" className="share-primary" disabled={busy || (destination === "social" && !excerpt.trim()) || (needsCollection && !selectedCollectionId)} onClick={() => void submit()}>{busy ? "Working…" : destination === "friend" ? "Share ↗" : destination === "social" ? "Publish clip" : "Save here"}</button></div>
        </footer>
      </section>
    </div>
  );
}
