import { createArticleCard } from "@/lib/articlePreview.server";
import { consumeFeedRefreshBudget } from "@/lib/feedRefreshGuard.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

/** Publisher image bytes are served back through our own origin so the card's
 *  <img> stays within `img-src 'self'` and never hotlinks a third-party host. */
function proxied(remote: string | null): string | null {
  return remote ? `/api/article-preview/image?url=${encodeURIComponent(remote)}` : null;
}

function unavailable(reason: string, status = 404): Response {
  return Response.json(
    { ok: false, reason },
    { status, headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url).searchParams.get("url");
  if (!url || url.length > 2_000) return unavailable("invalid-url", 400);

  const budget = consumeFeedRefreshBudget(request, 1);
  if (!budget.allowed) return unavailable("rate-limited", 429);

  const result = await instrument(
    { route: "article-preview-card", operation: "createArticleCard", correlationId: requestCorrelationId(request) },
    () => createArticleCard(url),
  );
  if (result.decision.allowed === false) return unavailable(result.decision.reason);
  if (!result.card) return unavailable("unavailable");

  const { card } = result;
  return Response.json(
    {
      ok: true,
      card: {
        title: card.title,
        description: card.description,
        siteName: card.siteName,
        domain: card.domain,
        imageUrl: proxied(card.imageUrl),
        faviconUrl: proxied(card.faviconUrl),
      },
    },
    { headers: { "Cache-Control": "private, max-age=3600" } },
  );
}
