import "server-only";

import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { HandleTakenError } from "./profileErrors.ts";
import type { Profile, ProfileInput } from "./profile.ts";

function profileRow(row: Record<string, unknown>): Profile {
  return {
    id: String(row.id),
    handle: String(row.handle),
    displayName: String(row.display_name),
    bio: typeof row.bio === "string" ? row.bio : null,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  };
}

const COLUMNS = "id,handle,display_name,bio,created_at,updated_at";

/** Reads and writes one account's public profile. A missing row is a valid, expected state (onboarding not done). */
export interface ProfileStore {
  get(userId: string): Promise<Profile | null>;
  /** Insert-or-update this account's profile. Throws {@link HandleTakenError} when the handle belongs to someone else. */
  save(userId: string, input: ProfileInput): Promise<Profile>;
}

export class SupabaseProfileStore implements ProfileStore {
  constructor(private readonly supabase: SupabaseClient) {}

  async get(userId: string): Promise<Profile | null> {
    const { data, error } = await this.supabase
      .from("profiles")
      .select(COLUMNS)
      .eq("id", userId)
      .maybeSingle();
    if (error) throw error;
    return data ? profileRow(data as Record<string, unknown>) : null;
  }

  async save(userId: string, input: ProfileInput): Promise<Profile> {
    const { data, error } = await this.supabase
      .from("profiles")
      .upsert(
        { id: userId, handle: input.handle, display_name: input.displayName, bio: input.bio },
        { onConflict: "id" }
      )
      .select(COLUMNS)
      .single();
    if (error) {
      if (isUniqueViolation(error)) throw new HandleTakenError(`Handle "${input.handle}" is taken`);
      throw error;
    }
    return profileRow(data as Record<string, unknown>);
  }
}

function isUniqueViolation(error: PostgrestError): boolean {
  return error.code === "23505";
}
