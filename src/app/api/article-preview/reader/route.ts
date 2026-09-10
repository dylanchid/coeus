import { createReaderView } from "@/lib/articlePreview.server";
import { consumeFeedRefreshBudget } from "@/lib/feedRefreshGuard.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

function unavailable(reason: string, status = 404): Response {
  return Response.json(
    { ok: false, reason },
    { status, headers: { "Cache-Control": "private, no-store, max-age=0" } },
  );
}

/**
 * SPIKE (bareaga_web-0bs.3): returns a sanitised, excerpt-length reader view for
 * a blocked / unknown embed. The content HTML is already cleaned and its images
 * are already rewritten to the same-origin proxy.
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url).searchParams.get("url");
  if (!url || url.length > 2_000) return unavailable("invalid-url", 400);

  const budget = consumeFeedRefreshBudget(request, 1);
  if (!budget.allowed) return unavailable("rate-limited", 429);

  const result = await instrument(
    { route: "article-preview-reader", operation: "createReaderView", correlationId: requestCorrelationId(request) },
    () => createReaderView(url),
  );
  if (result.decision.allowed === false) return unavailable(result.decision.reason);
  if (!result.reader) return unavailable("unavailable");

  return Response.json(
    { ok: true, reader: result.reader },
    { headers: { "Cache-Control": "private, max-age=3600" } },
  );
}
