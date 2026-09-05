"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import type { Destination, DestinationDelivery, DestinationKind } from "@/lib/destinations";

const NOTION_OAUTH_START_URL = "/api/archive/destinations/notion/oauth/start";

const KIND_LABEL: Record<DestinationKind, string> = {
  obsidian_git: "Obsidian (via GitHub)",
  notion: "Notion",
};

const STATUS_LABEL: Record<Destination["status"], string> = {
  active: "Connected",
  auth_error: "Needs reconnect",
  disabled: "Disconnected",
};

const DESTINATION_KINDS: DestinationKind[] = ["obsidian_git", "notion"];

function relativeTime(iso: string | null): string {
  if (!iso) return "never";
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(iso)) / 60_000));
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function lastAttemptOf(deliveries: DestinationDelivery[]): string | null {
  const timestamps = deliveries.map((delivery) => delivery.lastAttemptedAt).filter((value): value is string => Boolean(value));
  return timestamps.length ? [...timestamps].sort().at(-1)! : null;
}

async function requestJson(url: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(url, { credentials: "same-origin", cache: "no-store", ...init });
  if (!response.ok) {
    const body = await response.json().catch(() => null) as { error?: string } | null;
    throw new Error(body?.error ?? `Request failed (${response.status})`);
  }
  return response;
}

interface DestinationCard {
  destination: Destination;
  deliveries: DestinationDelivery[];
}

export function DestinationsPanel({ onNotice }: { onNotice?: (message: string) => void }) {
  const [cards, setCards] = useState<Partial<Record<DestinationKind, DestinationCard>>>({});
  const [loading, setLoading] = useState(true);
  const [busyKind, setBusyKind] = useState<DestinationKind | null>(null);
  const [obsidianFormOpen, setObsidianFormOpen] = useState(false);
  const [obsidianRepo, setObsidianRepo] = useState("");
  const [obsidianBranch, setObsidianBranch] = useState("main");
  const [obsidianPathPrefix, setObsidianPathPrefix] = useState("");
  const [obsidianToken, setObsidianToken] = useState("");

  const notify = (message: string) => onNotice?.(message);

  const load = async () => {
    try {
      const response = await requestJson("/api/archive/destinations");
      const body = (await response.json()) as { destinations: Destination[] };
      const next: Partial<Record<DestinationKind, DestinationCard>> = {};
      for (const destination of body.destinations) {
        let deliveries: DestinationDelivery[] = [];
        try {
          const deliveriesResponse = await requestJson(`/api/archive/destinations/${destination.kind}/deliveries`);
          deliveries = ((await deliveriesResponse.json()) as { deliveries: DestinationDelivery[] }).deliveries;
        } catch {
          // Delivery history is best-effort; the card still renders status without it.
        }
        next[destination.kind] = { destination, deliveries };
      }
      setCards(next);
    } catch (error) {
      notify(error instanceof Error ? error.message : "Destinations are unavailable");
    } finally {
      setLoading(false);
    }
  };

  // Loads on mount; if the Notion OAuth callback redirected back here with a
  // result, surfaces it once (after the reload) and then cleans the URL.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      await load();
      if (cancelled) return;
      const params = new URLSearchParams(window.location.search);
      const destination = params.get("destination");
      const status = params.get("status");
      if (!destination || !status) return;
      const label = KIND_LABEL[destination as DestinationKind] ?? destination;
      notify(status === "connected" ? `${label} connected` : (params.get("message") ?? `Connecting ${label} failed`));
      const url = new URL(window.location.href);
      url.searchParams.delete("destination");
      url.searchParams.delete("status");
      url.searchParams.delete("message");
      window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const connectObsidian = async () => {
    setBusyKind("obsidian_git");
    try {
      await requestJson("/api/archive/destinations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "obsidian_git",
          displayName: obsidianRepo || "Obsidian vault",
          config: { repo: obsidianRepo, branch: obsidianBranch || "main", pathPrefix: obsidianPathPrefix },
          secret: obsidianToken,
        }),
      });
      setObsidianToken("");
      setObsidianFormOpen(false);
      notify("Obsidian vault connected");
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Connecting Obsidian failed");
    } finally {
      setBusyKind(null);
    }
  };

  const syncNow = async (kind: DestinationKind) => {
    setBusyKind(kind);
    try {
      await requestJson(`/api/archive/destinations/${kind}/sync`, { method: "POST" });
      notify(`${KIND_LABEL[kind]} sync started`);
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Starting sync failed");
    } finally {
      setBusyKind(null);
    }
  };

  const disconnect = async (kind: DestinationKind, purge: boolean) => {
    const confirmed = window.confirm(
      purge
        ? `Permanently remove ${KIND_LABEL[kind]} and its delivery history? A future reconnect will re-send every item.`
        : `Disconnect ${KIND_LABEL[kind]}? You can reconnect later without re-sending already-delivered items.`
    );
    if (!confirmed) return;
    setBusyKind(kind);
    try {
      await requestJson(`/api/archive/destinations/${kind}${purge ? "?purge=1" : ""}`, { method: "DELETE" });
      notify(purge ? `${KIND_LABEL[kind]} removed` : `${KIND_LABEL[kind]} disconnected`);
      await load();
    } catch (error) {
      notify(error instanceof Error ? error.message : "Disconnecting failed");
    } finally {
      setBusyKind(null);
    }
  };

  return (
    <details className="archive-portability">
      <summary>Sync destinations</summary>
      <div className="archive-sidebar-actions destinations-panel" aria-label="Sync destinations">
        {loading ? <p className="archive-sync-state" role="status">Loading destinations…</p> : null}

        {DESTINATION_KINDS.map((kind) => {
          const card = cards[kind];
          const failures = card ? card.deliveries.filter((delivery) => delivery.status === "failed_auth" || delivery.status === "failed_retryable") : [];
          const needsReconnect = card?.destination.status === "auth_error";

          return (
            <div key={kind} className="destination-card">
              <div className="destination-card-head">
                <span>{KIND_LABEL[kind]}</span>
                <span className={`destination-status is-${card ? card.destination.status : "disabled"}`}>
                  {card ? STATUS_LABEL[card.destination.status] : "Not connected"}
                </span>
              </div>

              {card ? (
                <>
                  <p className="archive-sync-state" role="status">
                    {card.destination.displayName} · last attempt {relativeTime(lastAttemptOf(card.deliveries))}
                  </p>

                  {needsReconnect ? (
                    kind === "notion" ? (
                      <Link href={NOTION_OAUTH_START_URL}>Reconnect Notion ↗</Link>
                    ) : (
                      <button type="button" onClick={() => setObsidianFormOpen(true)}>Reconnect with a new GitHub token</button>
                    )
                  ) : null}

                  {failures.length ? (
                    <details className="destination-failures">
                      <summary>{failures.length} {failures.length === 1 ? "item" : "items"} need attention</summary>
                      <ul>
                        {failures.map((failure) => (
                          <li key={failure.itemId} className={`destination-failure is-${failure.status}`}>
                            <span>{failure.itemId}</span>
                            <small>
                              {failure.status === "failed_auth"
                                ? `Auth expired — reconnect ${kind === "notion" ? "Notion" : "GitHub"} to retry`
                                : (failure.lastError ?? "Will retry automatically")}
                            </small>
                          </li>
                        ))}
                      </ul>
                    </details>
                  ) : null}

                  <button type="button" disabled={busyKind === kind} onClick={() => void syncNow(kind)}>Sync now</button>
                  <button type="button" disabled={busyKind === kind} onClick={() => void disconnect(kind, false)}>Disconnect</button>
                  <button type="button" className="archive-danger" disabled={busyKind === kind} onClick={() => void disconnect(kind, true)}>Remove permanently…</button>
                </>
              ) : kind === "notion" ? (
                <Link href={NOTION_OAUTH_START_URL}>Connect Notion ↗</Link>
              ) : obsidianFormOpen ? (
                <form className="destination-connect-form" onSubmit={(event) => { event.preventDefault(); void connectObsidian(); }}>
                  <label htmlFor="obsidian-repo">Repository</label>
                  <input id="obsidian-repo" type="text" required value={obsidianRepo} onChange={(event) => setObsidianRepo(event.target.value)} placeholder="owner/vault" />
                  <label htmlFor="obsidian-branch">Branch</label>
                  <input id="obsidian-branch" type="text" value={obsidianBranch} onChange={(event) => setObsidianBranch(event.target.value)} placeholder="main" />
                  <label htmlFor="obsidian-path">Folder (optional)</label>
                  <input id="obsidian-path" type="text" value={obsidianPathPrefix} onChange={(event) => setObsidianPathPrefix(event.target.value)} placeholder="coeus" />
                  <label htmlFor="obsidian-token">GitHub personal access token</label>
                  <input id="obsidian-token" type="password" required autoComplete="off" value={obsidianToken} onChange={(event) => setObsidianToken(event.target.value)} placeholder="ghp_…" />
                  <div>
                    <button type="submit" disabled={busyKind === "obsidian_git"}>Connect</button>
                    <button type="button" onClick={() => setObsidianFormOpen(false)}>Cancel</button>
                  </div>
                </form>
              ) : (
                <button type="button" onClick={() => setObsidianFormOpen(true)}>Connect Obsidian (GitHub)</button>
              )}
            </div>
          );
        })}
      </div>
    </details>
  );
}
