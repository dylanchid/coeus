"use client";

import { useCallback, useState, type KeyboardEvent } from "react";
import Link from "next/link";
import type { CollectionPublication, PublicationVisibility } from "@/lib/publications/collectionPublication";
import {
  LADDER,
  LADDER_HELPERS,
  LADDER_LABELS,
  isLadderStep,
  ladderLabel,
} from "@/lib/publications/publishLadder";

/** Key this component by collection id so its drafts reset on collection changes. */
/**
 * What a not-yet-published collection should publish as: what the owner
 * already chose for it, except that "private" (the creation default) means
 * they haven't decided, so the safe link-only option is offered instead.
 */
export function defaultPublishVisibility(collectionVisibility: PublicationVisibility): PublicationVisibility {
  return collectionVisibility === "private" ? "unlisted" : collectionVisibility;
}

export function PublishLadderRadiogroup({
  idPrefix,
  value,
  onChange,
  storedVisibility,
}: {
  idPrefix: string;
  value: PublicationVisibility;
  onChange: (value: PublicationVisibility) => void;
  storedVisibility: PublicationVisibility | undefined;
}) {
  const showLegacy = storedVisibility === "followers" && value === "followers";
  const options: { value: PublicationVisibility; label: string; helper: string; legacy?: boolean }[] = LADDER.map(
    (step) => ({
      value: step,
      label: LADDER_LABELS[step],
      helper: LADDER_HELPERS[step],
    }),
  );
  if (showLegacy) {
    options.push({
      value: "followers",
      label: ladderLabel("followers"),
      helper: "Pick a level to change it.",
      legacy: true,
    });
  }

  const focusedIndex = options.findIndex((option) => option.value === value);
  const safeFocus = focusedIndex >= 0 ? focusedIndex : 0;

  const move = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    let next = index;
    if (event.key === "Home") next = 0;
    else if (event.key === "End") next = options.length - 1;
    else if (event.key === "ArrowDown" || event.key === "ArrowRight") next = (index + 1) % options.length;
    else next = (index - 1 + options.length) % options.length;
    onChange(options[next]!.value);
  };

  const selectedHelper = showLegacy && value === "followers"
    ? "Pick a level to change it."
    : isLadderStep(value)
      ? LADDER_HELPERS[value]
      : "";

  return (
    <div className="publish-ladder" role="radiogroup" aria-labelledby={`${idPrefix}-visibility-label`}>
      <span id={`${idPrefix}-visibility-label`} className="publish-ladder-legend">
        Visibility
      </span>
      {options.map((option, index) => {
        const checked = value === option.value;
        return (
          <button
            key={option.value}
            id={`${idPrefix}-visibility-${option.value}`}
            type="button"
            role="radio"
            aria-checked={checked}
            tabIndex={index === safeFocus ? 0 : -1}
            className={option.legacy ? "publish-ladder-step publish-ladder-step--legacy" : "publish-ladder-step"}
            onKeyDown={(event) => move(event, index)}
            onClick={() => onChange(option.value)}
          >
            <span className="publish-ladder-step-label">{option.label}</span>
            {checked ? <span className="publish-ladder-step-check" aria-hidden="true">✓</span> : null}
          </button>
        );
      })}
      <p className="publish-ladder-helper" role="status">{selectedHelper}</p>
    </div>
  );
}

export function PublishCollectionForm({
  idPrefix,
  curatorNote,
  setCuratorNote,
  attribution,
  setAttribution,
  showVisibility,
  visibility,
  setVisibility,
  storedVisibility,
}: {
  idPrefix: string;
  curatorNote: string;
  setCuratorNote: (value: string) => void;
  attribution: string;
  setAttribution: (value: string) => void;
  showVisibility: boolean;
  visibility: PublicationVisibility;
  setVisibility: (value: PublicationVisibility) => void;
  storedVisibility: PublicationVisibility | undefined;
}) {
  return (
    <>
      {showVisibility ? (
        <PublishLadderRadiogroup
          idPrefix={idPrefix}
          value={visibility}
          onChange={setVisibility}
          storedVisibility={storedVisibility}
        />
      ) : null}
      <label htmlFor={`${idPrefix}-curator-note`}>Curator note</label>
      <textarea
        id={`${idPrefix}-curator-note`}
        value={curatorNote}
        onChange={(event) => setCuratorNote(event.target.value)}
        placeholder="Why does this collection matter? What should followers expect?"
      />
      <label htmlFor={`${idPrefix}-attribution`}>Attribution</label>
      <input
        id={`${idPrefix}-attribution`}
        type="text"
        value={attribution}
        onChange={(event) => setAttribution(event.target.value)}
        placeholder="Curated by…"
      />
    </>
  );
}

export function ArchivePublishPanel({ collectionId, collectionVisibility, waitingForSync, publication, busy, onPublish, onUnpublish, onOpenMobileSheet }: {
  collectionId: string;
  collectionVisibility: PublicationVisibility;
  /** Publishing reads the server's copy of the archive, so it waits until local changes have synced. */
  waitingForSync: boolean;
  publication: CollectionPublication | undefined;
  busy: boolean;
  onPublish: (visibility: PublicationVisibility, curatorNote: string, attribution: string) => void;
  onUnpublish: () => void;
  onOpenMobileSheet?: () => void;
}) {
  const [visibility, setVisibility] = useState<PublicationVisibility>(publication?.visibility ?? defaultPublishVisibility(collectionVisibility));
  const [curatorNote, setCuratorNote] = useState(publication?.curatorNote ?? "");
  const [attribution, setAttribution] = useState(publication?.attribution ?? "");
  const idPrefix = `publish-${collectionId}`;
  // Open by default until the collection is published: publishing is the next
  // step for a curator, so it shouldn't hide behind a collapsed disclosure.
  // Decided once per mount, so a successful publish doesn't snap the panel
  // shut over the new link (the parent keys this component by collection).
  const [startOpen] = useState(!publication);
  const pickVisibility = useCallback((next: PublicationVisibility) => {
    setVisibility(next);
  }, []);

  const statusLine = publication ? (
    <>
      Published at <Link href={`/c/${publication.slug}`}>/c/{publication.slug}</Link> · {ladderLabel(publication.visibility)}
    </>
  ) : (
    "Not published yet"
  );

  return (
    <details className="archive-portability archive-publish-panel" open={startOpen || undefined}>
      <summary
        onClick={(event) => {
          if (!onOpenMobileSheet) return;
          if (window.matchMedia("(max-width: 640px)").matches) {
            event.preventDefault();
            onOpenMobileSheet();
          }
        }}
      >
        Publish
      </summary>
      <div className="archive-sidebar-actions archive-publish-desktop" aria-label="Publish this collection">
        <p className="archive-sync-state" role="status">{statusLine}</p>
        <PublishCollectionForm
          idPrefix={idPrefix}
          curatorNote={curatorNote}
          setCuratorNote={setCuratorNote}
          attribution={attribution}
          setAttribution={setAttribution}
          showVisibility
          visibility={visibility}
          setVisibility={pickVisibility}
          storedVisibility={publication?.visibility}
        />
        <button
          type="button"
          className="archive-primary-action"
          disabled={busy || waitingForSync}
          onClick={() => onPublish(visibility, curatorNote, attribution)}
        >
          {waitingForSync ? "Saving your changes…" : publication ? "Update publication" : "Publish collection"}
        </button>
        {publication ? (
          <button type="button" className="archive-danger" disabled={busy} onClick={onUnpublish}>
            Unpublish
          </button>
        ) : null}
        <Link href="/c">Browse public collections ↗</Link>
      </div>
    </details>
  );
}