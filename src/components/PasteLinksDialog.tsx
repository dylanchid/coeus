"use client";

import { useCallback, useId, useMemo, useRef, useState } from "react";
import { addLinksToCollection } from "@/lib/archive/archiveDomain";
import { checkArchiveBudget } from "@/lib/archive/archiveBudget";
import type { ArchiveData } from "@/lib/archive";
import { parsePastedLinks, type ResolvedPasteLink } from "@/lib/archive/pasteLinks";
import { useModalDialog } from "@/hooks/useModalDialog";

type ReviewRow = ResolvedPasteLink & { id: string; checked: boolean; hint?: string };

export function PasteLinksDialog({
  open,
  onClose,
  collectionId,
  collectionName,
  data,
  onApply,
  onNotice,
}: {
  open: boolean;
  onClose: () => void;
  collectionId: string;
  collectionName: string;
  data: ArchiveData;
  onApply: (recipe: (current: ArchiveData) => ArchiveData) => Promise<boolean>;
  onNotice: (message: string) => void;
}) {
  const titleId = useId();
  const dialogRef = useRef<HTMLElement>(null);
  const [text, setText] = useState("");
  const [phase, setPhase] = useState<"paste" | "review">("paste");
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [parseMeta, setParseMeta] = useState({ duplicatesSkipped: 0, notWebLink: 0, capped: false });
  const [busy, setBusy] = useState(false);

  const selectedCount = useMemo(() => rows.filter((row) => row.checked).length, [rows]);

  const reset = useCallback(() => {
    setText("");
    setPhase("paste");
    setRows([]);
    setParseMeta({ duplicatesSkipped: 0, notWebLink: 0, capped: false });
    setBusy(false);
  }, []);

  const handleClose = useCallback(() => {
    reset();
    onClose();
  }, [onClose, reset]);

  useModalDialog({ active: open, containerRef: dialogRef, onClose: handleClose });

  const resolve = useCallback(async () => {
    const parsed = parsePastedLinks(text);
    if (!parsed.links.length) {
      onNotice("Paste at least one http or https link.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/archive/resolve-links", {
        method: "POST",
        credentials: "same-origin",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ urls: parsed.links }),
      });
      if (response.status === 429) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        onNotice(body?.error ?? "Link resolve budget spent — try again shortly.");
        return;
      }
      if (!response.ok) {
        const body = await response.json().catch(() => null) as { error?: string } | null;
        onNotice(body?.error ?? `Resolve failed (${response.status})`);
        return;
      }
      const resolved = await response.json() as Array<{
        url: string;
        ok: boolean;
        title: string;
        sourceName: string;
        author: string;
        excerpt: string;
      }>;
      const byUrl = new Map(resolved.map((row) => [row.url.toLowerCase(), row]));
      const review: ReviewRow[] = parsed.links.map((url, index) => {
        const match = byUrl.get(url.toLowerCase());
        const host = (() => {
          try {
            return new URL(url).hostname.replace(/^www\./i, "");
          } catch {
            return url;
          }
        })();
        const ok = match?.ok ?? false;
        const title = match?.title?.trim() || host;
        return {
          id: `${index}-${url}`,
          url,
          title,
          sourceName: match?.sourceName?.trim() || host,
          author: match?.author ?? "",
          excerpt: match?.excerpt ?? "",
          ok,
          checked: true,
          hint: ok ? undefined : "Title not found",
        };
      });
      setParseMeta({
        duplicatesSkipped: parsed.duplicatesSkipped,
        notWebLink: parsed.notWebLink,
        capped: parsed.capped,
      });
      setRows(review);
      setPhase("review");
    } catch (error) {
      onNotice(error instanceof Error ? error.message : "Resolve failed");
    } finally {
      setBusy(false);
    }
  }, [onNotice, text]);

  const addEntries = useCallback(async () => {
    const chosen = rows.filter((row) => row.checked);
    if (!chosen.length) {
      onNotice("Select at least one entry to add.");
      return;
    }
    const links: ResolvedPasteLink[] = chosen.map((row) => ({
      url: row.url,
      title: row.title,
      sourceName: row.sourceName,
      author: row.author,
      excerpt: row.excerpt,
      ok: row.ok,
    }));
    const next = addLinksToCollection(data, links, collectionId);
    const violation = checkArchiveBudget({
      syncVersion: 1,
      revision: 0,
      generatedAt: new Date().toISOString(),
      archive: next,
      entityVersions: {},
    });
    if (violation) {
      onNotice(violation.message);
      return;
    }
    const ok = await onApply((current) => addLinksToCollection(current, links, collectionId));
    if (ok) {
      onNotice(`Added ${chosen.length} entries to ${collectionName}`);
      handleClose();
    }
  }, [collectionId, collectionName, data, handleClose, onApply, onNotice, rows]);

  if (!open) return null;

  return (
    <div className="paste-links-backdrop" onClick={handleClose}>
      <section
        ref={dialogRef}
        className="paste-links-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <header className="paste-links-head">
          <h2 id={titleId}>Paste links</h2>
          <p>Into <strong>{collectionName}</strong></p>
          <button type="button" className="paste-links-close" onClick={handleClose} aria-label="Close">×</button>
        </header>
        {phase === "paste" ? (
          <>
            <label className="paste-links-field" htmlFor="paste-links-text">
              One URL per line (up to 50)
            </label>
            <textarea
              id="paste-links-text"
              className="paste-links-textarea"
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="https://…"
              rows={8}
            />
            <div className="paste-links-actions">
              <button type="button" className="archive-primary-action" disabled={busy || !text.trim()} onClick={() => void resolve()}>
                {busy ? "Resolving…" : "Resolve"}
              </button>
            </div>
          </>
        ) : (
          <>
            <ul className="paste-links-meta" aria-live="polite">
              {parseMeta.duplicatesSkipped ? <li>{parseMeta.duplicatesSkipped} duplicates skipped</li> : null}
              {parseMeta.notWebLink ? <li>{parseMeta.notWebLink} not a web link</li> : null}
              {parseMeta.capped ? <li>Only the first 50 links are added</li> : null}
            </ul>
            <ul className="paste-links-review">
              {rows.map((row) => (
                <li key={row.id}>
                  <label>
                    <input
                      type="checkbox"
                      checked={row.checked}
                      onChange={(event) => setRows((current) => current.map((entry) => (entry.id === row.id ? { ...entry, checked: event.target.checked } : entry)))}
                    />
                    <span className="paste-links-review-status">{row.ok ? "Resolved" : "Unresolved"}</span>
                    <input
                      type="text"
                      className="paste-links-title-input"
                      value={row.title}
                      aria-label={`Title for ${row.url}`}
                      onChange={(event) => setRows((current) => current.map((entry) => (entry.id === row.id ? { ...entry, title: event.target.value } : entry)))}
                    />
                    <span className="paste-links-url">{row.url}</span>
                    {row.hint ? <small className="paste-links-hint">{row.hint}</small> : null}
                  </label>
                </li>
              ))}
            </ul>
            <div className="paste-links-actions">
              <button type="button" onClick={() => setPhase("paste")}>Back</button>
              <button type="button" className="archive-primary-action" disabled={!selectedCount} onClick={() => void addEntries()}>
                Add {selectedCount} {selectedCount === 1 ? "entry" : "entries"}
              </button>
            </div>
          </>
        )}
      </section>
    </div>
  );
}