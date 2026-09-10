import { embedCompatibilityCache } from "@/lib/embedCompatibility.server";
import { consumeFeedRefreshBudget } from "@/lib/feedRefreshGuard.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";
import type { EmbedCompatibility } from "@/lib/types";

export const dynamic = "force-dynamic";

function respond(compatibility: EmbedCompatibility, status = 200): Response {
  return Response.json(
    { compatibility },
    { status, headers: { "Cache-Control": "private, max-age=0" } },
  );
}

/**
 * Resolves the framing policy for a single article URL. The reader modal calls this
 * before deciding between an inline iframe and the static fallback; a failed or
 * missing verdict is reported as "unknown", which the modal treats as "show the
 * fallback" rather than "skip the preview".
 */
export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url).searchParams.get("url");
  if (!url || url.length > 2_000) return respond("unknown", 400);

  let target: URL;
  try {
    target = new URL(url);
  } catch {
    return respond("unknown", 400);
  }
  if (target.protocol !== "https:") return respond("unknown", 400);

  const budget = consumeFeedRefreshBudget(request, 1);
  if (!budget.allowed) return respond("unknown", 429);

  const compatibility = await instrument(
    { route: "embed-compatibility", operation: "inspectEmbedCompatibility", correlationId: requestCorrelationId(request) },
    () => embedCompatibilityCache.get(target.toString()),
  );
  return respond(compatibility);
}
