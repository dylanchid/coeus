import { createArticleCard } from "@/lib/articles/articlePreview.server";
import { createLinkResolvePostHandler } from "@/lib/articles/linkResolve";
import { consumeFeedRefreshBudget } from "@/lib/feeds/feedRefreshGuard.server";
import { isOutboundUrlAllowed } from "@/lib/safeOutboundFetch.server";

export const dynamic = "force-dynamic";

const POST = createLinkResolvePostHandler({
  resolveCard: createArticleCard,
  consumeBudget: consumeFeedRefreshBudget,
  isUrlAllowed: isOutboundUrlAllowed,
});

export { POST };