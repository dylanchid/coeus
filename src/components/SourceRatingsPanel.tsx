"use client";

import { useEffect, useState } from "react";
import { RATING_BUCKETS, type SourceRatingSummary } from "@/lib/sourceRatings";
import { StarRating } from "./StarRating";

type Props = {
  sourceId: string;
  sourceName: string;
  /** The reader's own rating (browser-local preference), 0 when unrated. */
  rating: number;
  onRate: (rating: number) => void;
};

type Remote = SourceRatingSummary & { signedIn: boolean };

function formatCount(count: number): string {
  if (count >= 1000) return `${(count / 1000).toFixed(count >= 10000 ? 0 : 1).replace(/\.0$/, "")}K`;
  return String(count);
}

/** Community rating histogram (½ → 5 stars) above the reader's own clickable stars. */
export function SourceRatingsPanel({ sourceId, sourceName, rating, onRate }: Props) {
  const [remote, setRemote] = useState<Remote | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    void fetch(`/api/sources/ratings?id=${encodeURIComponent(sourceId)}`, { signal: controller.signal, headers: { accept: "application/json" } })
      .then((response) => (response.ok ? (response.json() as Promise<Remote>) : null))
      .then((body) => { if (controller.signal.aborted) return; if (body) setRemote(body); else setFailed(true); })
      .catch(() => { if (!controller.signal.aborted) setFailed(true); });
    return () => controller.abort();
  }, [sourceId]);

  const rate = (value: number) => {
    onRate(value);
    if (!remote?.signedIn) return;
    void fetch("/api/sources/ratings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sourceId, rating: value }),
    })
      .then((response) => (response.ok ? (response.json() as Promise<Remote>) : null))
      .then((body) => { if (body) setRemote(body); })
      .catch(() => undefined);
  };

  const histogram = remote?.histogram ?? Array.from({ length: RATING_BUCKETS }, () => 0);
  const peak = Math.max(1, ...histogram);

  return (
    <section className="source-ratings" aria-labelledby="source-ratings-title">
      <header>
        <h3 id="source-ratings-title">Ratings</h3>
        <span>{remote ? `${formatCount(remote.count)} ${remote.count === 1 ? "rating" : "ratings"}` : failed ? "unavailable" : "…"}</span>
      </header>
      <div className="source-ratings-chart">
        <i className="source-ratings-low" aria-hidden="true">★</i>
        <ol role="img" aria-label={remote?.count ? `Rating distribution for ${sourceName}, average ${remote.average?.toFixed(1)} of 5` : `No ratings yet for ${sourceName}`}>
          {histogram.map((count, index) => (
            <li key={index} title={`${(index + 1) / 2} stars: ${count}`}>
              <span style={{ height: `${count ? Math.max(6, (count / peak) * 100) : 2}%` }} />
            </li>
          ))}
        </ol>
        <strong>{remote?.average != null ? remote.average.toFixed(1) : "—"}<small aria-hidden="true">★★★★★</small></strong>
      </div>
      <StarRating value={rating} onChange={rate} label={`Your rating for ${sourceName}`} />
      {remote && !remote.signedIn ? <p className="source-ratings-note">Sign in to add your rating to the average.</p> : null}
    </section>
  );
}
