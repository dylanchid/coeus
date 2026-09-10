import { createArticlePreview } from "@/lib/articlePreview.server";
import { consumeFeedRefreshBudget } from "@/lib/feedRefreshGuard.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";

export const dynamic = "force-dynamic";

function unavailable(reason: string, status = 404): Response {
  return Response.json({ ok: false, reason }, { status, headers: { "Cache-Control": "private, no-store, max-age=0" } });
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url).searchParams.get("url");
  if (!url || url.length > 2_000) return unavailable("invalid-url", 400);
  const budget = consumeFeedRefreshBudget(request, 1);
  if (!budget.allowed) return unavailable("rate-limited", 429);
  const result = await instrument(
    { route: "article-preview", operation: "createArticlePreview", correlationId: requestCorrelationId(request) },
    () => createArticlePreview(url),
  );
  if (result.decision.allowed === false) return unavailable(result.decision.reason);
  if (!result.png) return unavailable("unavailable");
  const body = new Uint8Array(result.png).buffer;
  return new Response(body, {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600", "X-Content-Type-Options": "nosniff" },
  });
}
