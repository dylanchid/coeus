import "server-only";

import { FixedWindowBudget, type BudgetDecision } from "./fixedWindowBudget";

const REFRESH_SOURCE_BUDGET = 80;
const REFRESH_WINDOW_MS = 60_000;

const refreshBudget = new FixedWindowBudget(REFRESH_SOURCE_BUDGET, REFRESH_WINDOW_MS);

function clientKey(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return forwarded || request.headers.get("x-real-ip") || "local";
}

export function consumeFeedRefreshBudget(request: Request, sourceCount: number): BudgetDecision {
  return refreshBudget.consume(clientKey(request), sourceCount);
}
