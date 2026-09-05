import type { ArchiveItem } from "./archiveTypes.ts";

export interface DestinationPushResult {
  ok: boolean;
  /** The adapter's upsert key (a GitHub file path or a Notion page ID), when a push created or confirmed one. */
  externalRef?: string;
  httpStatus?: number;
  error?: string;
  /** A 401/expired-token failure. Callers must flip the destination to auth_error and never auto-retry. */
  authError?: boolean;
}

/** No I/O lives in this file: real GitHub/Notion adapters implement this against an injected fetch. */
export interface DestinationAdapter {
  pushUpsert(item: ArchiveItem, existingExternalRef: string | null): Promise<DestinationPushResult>;
  pushDelete(itemId: string, existingExternalRef: string): Promise<DestinationPushResult>;
}
