import { fetchPreviewImage } from "@/lib/articlePreview.server";
import { consumeFeedRefreshBudget } from "@/lib/feedRefreshGuard.server";
import { verifyPreviewImageUrl } from "@/lib/imageProxySignature.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";
import { requiredEnvironment } from "@/lib/supabase.server";

export const dynamic = "force-dynamic";

function unavailable(status = 404): Response {
  return new Response(null, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

export async function GET(request: Request): Promise<Response> {
  const params = new URL(request.url).searchParams;
  const url = params.get("url");
  const expiresParam = params.get("expires");
  const signature = params.get("signature");
  if (!url || url.length > 2_000 || !expiresParam || !signature) return unavailable(400);

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return unavailable(400);
  }
  if (target.protocol !== "https:") return unavailable(400);

  const expires = Number(expiresParam);
  const secret = requiredEnvironment("ARTICLE_PREVIEW_IMAGE_SECRET");
  // Only URLs signed by /api/article-preview/card are honoured — this route is
  // not a general-purpose image proxy.
  if (!verifyPreviewImageUrl(url, expires, signature, secret)) return unavailable(403);

  const budget = consumeFeedRefreshBudget(request, 1);
  if (!budget.allowed) return unavailable(429);

  try {
    const image = await instrument(
      { route: "article-preview-image", operation: "fetchPreviewImage", correlationId: requestCorrelationId(request) },
      () => fetchPreviewImage(target.toString()),
    );
    return new Response(new Uint8Array(image.body).buffer, {
      headers: {
        "Content-Type": image.contentType,
        "Cache-Control": "private, max-age=86400",
        "X-Content-Type-Options": "nosniff",
        // Belt and braces: even if a non-image slips the content-type check it
        // cannot execute or reach the network when rendered.
        "Content-Security-Policy": "default-src 'none'; sandbox",
        "Content-Disposition": "inline",
      },
    });
  } catch {
    return unavailable(502);
  }
}
