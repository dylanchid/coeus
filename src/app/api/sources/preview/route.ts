import "server-only";

import { consumeFeedRefreshBudget } from "@/lib/feedRefreshGuard.server";
import { previewFeedUrl } from "@/lib/sourcePreview.server";

export const dynamic = "force-dynamic";

const NO_STORE = { "Cache-Control": "private, no-store, max-age=0" };

function json(body: unknown, status: number, headers: Record<string, string> = {}) {
  return Response.json(body, { status, headers: { ...NO_STORE, ...headers } });
}

export async function POST(request: Request): Promise<Response> {
  const budget = consumeFeedRefreshBudget(request, 1);
  if (!budget.allowed) {
    return json(
      { ok: false, error: "Too many preview requests. Try again shortly." },
      429,
      { "Retry-After": String(budget.retryAfterSeconds) }
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ ok: false, error: "Request body must be valid JSON." }, 400);
  }

  const url =
    body && typeof body === "object" ? (body as Record<string, unknown>).url : undefined;
  if (typeof url !== "string" || !url.trim() || url.length > 2000) {
    return json({ ok: false, error: "Provide a feed URL." }, 400);
  }

  const result = await previewFeedUrl(url.trim());
  return json(result, result.ok ? 200 : 422);
}
