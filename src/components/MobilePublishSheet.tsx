"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import type { ArchiveCollection, ArchiveData } from "@/lib/archive";
import type { CollectionPublication, PublicationVisibility } from "@/lib/publications/collectionPublication";
import { defaultPublishVisibility, PublishCollectionForm, PublishLadderRadiogroup } from "./ArchivePublishPanel";
import { CopyLinkButton } from "./CopyLinkButton";
import { useModalDialog } from "@/hooks/useModalDialog";

type Step = "collection" | "entries" | "note" | "visibility" | "done";

export function MobilePublishSheet({
  open,
  onClose,
  data,
  collectionId,
  setCollectionId,
  selectedCollection,
  onCreateCollection,
  onOpenPasteLinks,
  onOpenSelectItems,
  authSignedIn,
  waitingForSync,
  publication,
  busy,
  onPublish,
  signInHref,
}: {
  open: boolean;
  onClose: () => void;
  data: ArchiveData;
  collectionId: string;
  setCollectionId: (id: string) => void;
  selectedCollection: ArchiveCollection | undefined;
  onCreateCollection: (name: string) => void;
  onOpenPasteLinks: () => void;
  onOpenSelectItems: () => void;
  authSignedIn: boolean;
  waitingForSync: boolean;
  publication: CollectionPublication | undefined;
  busy: boolean;
  onPublish: (visibility: PublicationVisibility, curatorNote: string, attribution: string) => Promise<CollectionPublication | null>;
  signInHref: string;
}) {
  const sheetRef = useRef<HTMLElement>(null);
  const [step, setStep] = useState<Step>("collection");
  const [newName, setNewName] = useState("");
  const [visibility, setVisibility] = useState<PublicationVisibility>(
    publication?.visibility ?? defaultPublishVisibility(selectedCollection?.visibility ?? "private"),
  );
  const [curatorNote, setCuratorNote] = useState(publication?.curatorNote ?? "");
  const [attribution, setAttribution] = useState(publication?.attribution ?? "");
  const [publishedSlug, setPublishedSlug] = useState<string | null>(publication?.slug ?? null);

  const reset = useCallback(() => {
    setStep("collection");
    setNewName("");
    setVisibility(publication?.visibility ?? defaultPublishVisibility(selectedCollection?.visibility ?? "private"));
    setCuratorNote(publication?.curatorNote ?? "");
    setAttribution(publication?.attribution ?? "");
    setPublishedSlug(publication?.slug ?? null);
  }, [publication, selectedCollection?.visibility]);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  useModalDialog({ active: open, containerRef: sheetRef, onClose: handleClose });

  const namedCollections = data.collections.filter((collection) => collection.id !== "inbox");

  const publish = useCallback(async () => {
    const slug = await onPublish(visibility, curatorNote, attribution);
    if (slug) {
      setPublishedSlug(slug.slug);
      setStep("done");
    }
  }, [attribution, curatorNote, onPublish, visibility]);

  if (!open) return null;

  const idPrefix = `mobile-publish-${collectionId}`;

  return (
    <div className="mobile-publish-backdrop" onClick={handleClose}>
      <section ref={sheetRef} className="mobile-publish-sheet" role="dialog" aria-modal="true" aria-label="Publish collection" onClick={(event) => event.stopPropagation()}>
        <header className="mobile-publish-head">
          <span>Publish collection</span>
          <button type="button" className="mobile-publish-close" onClick={handleClose} aria-label="Close">×</button>
        </header>

        {!authSignedIn ? (
          <p className="mobile-publish-signin">
            <Link href={signInHref}>Sign in to publish</Link>
          </p>
        ) : null}

        {authSignedIn && step === "collection" ? (
          <div className="mobile-publish-step">
            <h3>Collection</h3>
            <div className="mobile-publish-collection-pick" role="listbox" aria-label="Choose collection">
              {namedCollections.map((collection) => (
                <button
                  key={collection.id}
                  type="button"
                  className={collectionId === collection.id ? "is-active" : ""}
                  onClick={() => { setCollectionId(collection.id); setStep("entries"); }}
                >
                  {collection.name}
                </button>
              ))}
            </div>
            <label htmlFor="mobile-new-collection">New collection</label>
            <input
              id="mobile-new-collection"
              type="text"
              value={newName}
              onChange={(event) => setNewName(event.target.value)}
              placeholder="Collection name"
            />
            <button
              type="button"
              className="archive-primary-action"
              disabled={!newName.trim()}
              onClick={() => { onCreateCollection(newName.trim()); setStep("entries"); }}
            >
              Continue
            </button>
          </div>
        ) : null}

        {authSignedIn && step === "entries" ? (
          <div className="mobile-publish-step">
            <h3>Add entries</h3>
            <p>{selectedCollection?.name ?? "Choose a collection"}</p>
            <button type="button" className="archive-primary-action" onClick={() => { onOpenPasteLinks(); handleClose(); }}>
              Paste links
            </button>
            <button type="button" onClick={() => { onOpenSelectItems(); handleClose(); }}>
              Select saved items
            </button>
            <button type="button" onClick={() => setStep("note")}>Continue</button>
          </div>
        ) : null}

        {authSignedIn && step === "note" ? (
          <div className="mobile-publish-step">
            <h3>Curator note</h3>
            <PublishCollectionForm
              idPrefix={idPrefix}
              curatorNote={curatorNote}
              setCuratorNote={setCuratorNote}
              attribution={attribution}
              setAttribution={setAttribution}
              showVisibility={false}
              visibility={visibility}
              setVisibility={setVisibility}
              storedVisibility={publication?.visibility}
            />
            <button type="button" className="archive-primary-action" onClick={() => setStep("visibility")}>Continue</button>
          </div>
        ) : null}

        {authSignedIn && step === "visibility" ? (
          <div className="mobile-publish-step">
            <h3>Visibility</h3>
            <PublishLadderRadiogroup
              idPrefix={idPrefix}
              value={visibility}
              onChange={setVisibility}
              storedVisibility={publication?.visibility}
            />
            <button
              type="button"
              className="archive-primary-action"
              disabled={busy || waitingForSync}
              onClick={() => void publish()}
            >
              {waitingForSync ? "Saving your changes…" : "Publish"}
            </button>
          </div>
        ) : null}

        {authSignedIn && step === "done" && publishedSlug ? (
          <div className="mobile-publish-step mobile-publish-done">
            <p>Published at /c/{publishedSlug}</p>
            <CopyLinkButton url={`${typeof window !== "undefined" ? window.location.origin : ""}/c/${publishedSlug}`} className="archive-primary-action" />
            <Link className="archive-primary-action" href={`/c/${publishedSlug}`}>Open public page</Link>
          </div>
        ) : null}
      </section>
    </div>
  );
}