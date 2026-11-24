import { createArticleCard } from "@/lib/articles/articlePreview.server";
import { createLinkResolvePostHandler } from "@/lib/articles/linkResolve";
import { consumeFeedRefreshBudget } from "@/lib/feeds/feedRefreshGuard.server";
import { validatedHttpsUrl } from "@/lib/safeOutboundFetch.server";

export const dynamic = "force-dynamic";

async function isUrlAllowed(url: string): Promise<boolean> {
  if (!url.startsWith("https://")) return url.startsWith("http://");
  try {
    await validatedHttpsUrl(url);
    return true;
  } catch {
    return false;
  }
}

const POST = createLinkResolvePostHandler({
  resolveCard: createArticleCard,
  consumeBudget: consumeFeedRefreshBudget,
  isUrlAllowed,
});

export { POST };