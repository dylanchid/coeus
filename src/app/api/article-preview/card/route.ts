import { createArticleCard } from "@/lib/articlePreview.server";
import { consumeFeedRefreshBudget } from "@/lib/feedRefreshGuard.server";
import { signPreviewImageUrl } from "@/lib/imageProxySignature.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";
import { requiredEnvironment } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

/** Publisher image bytes are served back through our own origin so the card's
 *  <img> stays within `img-src 'self'` and never hotlinks a third-party host.
 *  Signed so `/api/article-preview/image` only honours URLs minted here. */
function proxied(remote: string | null, secret: string): string | null {
  if (!remote) return null;
  const { expires, signature } = signPreviewImageUrl(remote, secret);
  const params = new URLSearchParams({ url: remote, expires: String(expires), signature });
  return `/api/article-preview/image?${params.toString()}`;
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
  const secret = requiredEnvironment("ARTICLE_PREVIEW_IMAGE_SECRET");
  return Response.json(
    {
      ok: true,
      card: {
        title: card.title,
        description: card.description,
        siteName: card.siteName,
        domain: card.domain,
        imageUrl: proxied(card.imageUrl, secret),
        faviconUrl: proxied(card.faviconUrl, secret),
        index: card.index,
      },
    },
    { headers: { "Cache-Control": "private, max-age=3600" } },
  );
}
