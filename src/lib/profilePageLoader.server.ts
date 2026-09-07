import "server-only";

import { cache } from "react";
import { SupabaseProfileStore } from "./profileStore.server.ts";
import { createAdminSupabaseClient } from "./supabase.server.ts";

/**
 * The one handle → profile lookup shared by every profile surface:
 * `generateMetadata` and the page body of `/@handle`, plus `/@handle/followers`
 * and `/@handle/following`. `cache()` dedupes it within a single request, so
 * the metadata pass and the render pass cost one query between them.
 *
 * `resolveHandle` is the only handle lookup in the codebase (profileStore.server.ts);
 * this wrapper just makes the client + store construction a single import.
 * A thrown error (a Supabase outage) is left to Next's error boundary; only a
 * genuinely missing handle returns null and reads as 404.
 */
export const loadProfileIdentity = cache(async (handle: string) => {
  const store = new SupabaseProfileStore(createAdminSupabaseClient());
  return store.resolveHandle(handle);
});
