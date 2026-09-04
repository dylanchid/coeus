import "server-only";

import { resolveFeedUrl } from "./feedDiscovery.server.ts";
import { buildSourcePreview, type SourcePreview } from "./sourcePreview.ts";

export type SourcePreviewResult =
  | { ok: true; preview: SourcePreview }
  | { ok: false; error: string };

/**
 * Resolve a user-pasted publication URL to a feed and preview it for the
 * add-source flow. Resolution (direct feed, Substack convention, HTML
 * autodiscovery) and fetching both live in resolveFeedUrl/fetchFeedText —
 * this just shapes the result for the API route.
 */
export async function previewFeedUrl(rawUrl: string): Promise<SourcePreviewResult> {
  const resolved = await resolveFeedUrl(rawUrl);
  if (!resolved.ok) return resolved;
  return { ok: true, preview: buildSourcePreview(resolved.feed, resolved.feedUrl) };
}
