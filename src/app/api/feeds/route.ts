import "server-only";

import { createFeedGetHandler, createFeedPostHandler } from "@/lib/feedApi";
import { consumeFeedRefreshBudget } from "@/lib/feedRefreshGuard.server";
import { fetchFeeds } from "@/lib/feeds/feeds.server";
import { instrument, requestCorrelationId } from "@/lib/serverLog";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const dependencies = { fetchFeeds, consumeRefreshBudget: consumeFeedRefreshBudget };

const getHandler = createFeedGetHandler(dependencies);
const postHandler = createFeedPostHandler(dependencies);

export function GET(request: Request): Promise<Response> {
  return instrument({ route: "feeds", operation: "GET", correlationId: requestCorrelationId(request) }, () => getHandler(request));
}
export function POST(request: Request): Promise<Response> {
  return instrument({ route: "feeds", operation: "POST", correlationId: requestCorrelationId(request) }, () => postHandler(request));
}
