import "server-only";

import { createFeedGetHandler, createFeedPostHandler } from "@/lib/feedApi";
import { consumeFeedRefreshBudget } from "@/lib/feedRefreshGuard.server";
import { fetchFeeds } from "@/lib/feeds";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const dependencies = { fetchFeeds, consumeRefreshBudget: consumeFeedRefreshBudget };

export const GET = createFeedGetHandler(dependencies);
export const POST = createFeedPostHandler(dependencies);
