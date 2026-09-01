import "server-only";

import { createFeedGetHandler } from "@/lib/feedApi";
import { consumeFeedRefreshBudget } from "@/lib/feedRefreshGuard.server";
import { fetchFeeds } from "@/lib/feeds";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export const GET = createFeedGetHandler({ fetchFeeds, consumeRefreshBudget: consumeFeedRefreshBudget });
