import { fetchPreviewImage } from "@/lib/articlePreview.server";
import { consumeFeedRefreshBudget } from "@/lib/feedRefreshGuard.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

function unavailable(status = 404): Response {
  return new Response(null, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url).searchParams.get("url");
  if (!url || url.length > 2_000) return unavailable(400);

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return unavailable(400);
  }
  if (target.protocol !== "https:") return unavailable(400);

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
