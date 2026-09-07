import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/** A short-lived authorization attempt, consumed atomically by the callback. */
export interface NotionOAuthStateStore {
  create(nonce: string, ownerId: string, expiresAt: Date): Promise<void>;
  consume(nonce: string, ownerId: string): Promise<boolean>;
}

export class SupabaseNotionOAuthStateStore implements NotionOAuthStateStore {
  private readonly supabase: SupabaseClient;

  constructor(supabase: SupabaseClient) {
    this.supabase = supabase;
  }

  async create(nonce: string, ownerId: string, expiresAt: Date): Promise<void> {
    const { error } = await this.supabase.from("notion_oauth_states").insert({
      nonce,
      owner_id: ownerId,
      expires_at: expiresAt.toISOString(),
    });
    if (error) throw error;
  }

  async consume(nonce: string, ownerId: string): Promise<boolean> {
    const { data, error } = await this.supabase.rpc("consume_notion_oauth_state", {
      p_nonce: nonce,
      p_owner_id: ownerId,
    });
    if (error) throw error;
    return Boolean(data);
  }
}
