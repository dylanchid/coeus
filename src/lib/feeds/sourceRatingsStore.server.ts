import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import { summarizeRatings, type SourceRatingSummary } from "./sourceRatings.ts";

export interface SourceRatingsStore {
  summary(sourceId: string): Promise<SourceRatingSummary>;
  /** The caller's own rating in stars, or 0 when unrated. */
  mine(userId: string, sourceId: string): Promise<number>;
  /** halfSteps 0 clears the rating. */
  set(userId: string, sourceId: string, halfSteps: number): Promise<void>;
}

export class SupabaseSourceRatingsStore implements SourceRatingsStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async summary(sourceId: string): Promise<SourceRatingSummary> {
    const { data, error } = await this.supabase.rpc("source_rating_histogram", { p_source_id: sourceId });
    if (error) throw error;
    const rows = (data ?? []) as { half_steps: number; ratings: number | string }[];
    return summarizeRatings(rows.map((row) => ({ halfSteps: Number(row.half_steps), ratings: Number(row.ratings) })));
  }

  async mine(userId: string, sourceId: string): Promise<number> {
    const { data, error } = await this.supabase
      .from("source_ratings")
      .select("half_steps")
      .eq("user_id", userId)
      .eq("source_id", sourceId)
      .maybeSingle();
    if (error) throw error;
    return data ? Number((data as { half_steps: number }).half_steps) / 2 : 0;
  }

  async set(userId: string, sourceId: string, halfSteps: number): Promise<void> {
    if (halfSteps === 0) {
      const { error } = await this.supabase.from("source_ratings").delete().eq("user_id", userId).eq("source_id", sourceId);
      if (error) throw error;
      return;
    }
    const { error } = await this.supabase.from("source_ratings").upsert(
      { user_id: userId, source_id: sourceId, half_steps: halfSteps, updated_at: new Date().toISOString() },
      { onConflict: "user_id,source_id" }
    );
    if (error) throw error;
  }
}
